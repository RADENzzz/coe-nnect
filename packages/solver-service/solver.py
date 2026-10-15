from ortools.sat.python import cp_model
from pydantic import BaseModel
from typing import List, Optional, Dict
from collections import defaultdict


# ═══════════════════════════════════════════
# Pydantic models
# ═══════════════════════════════════════════

class Section(BaseModel):
    sectionId: str
    sectionCode: str
    programId: Optional[str] = None
    yearLevel: Optional[int] = None


class Subject(BaseModel):
    subjectId: str
    subjectCode: str
    title: str
    totalUnits: float
    lectureUnits: float
    labUnits: float
    requiredRoomType: Optional[str] = None
    deptId: str


class ProspectusEntry(BaseModel):
    prospectusId: str
    programId: str
    subjectId: str
    yearLevel: int
    semester: str

    # ── Multi-session scheduling (Phase 1) ──
    lecture_sessions_per_week: int = 1
    lecture_minutes_per_session: int = 90
    lab_sessions_per_week: int = 1
    lab_minutes_per_session: int = 180


class Faculty(BaseModel):
    facultyId: str
    firstName: str
    lastName: str
    deptId: Optional[str] = None
    classification: str = "regular"
    requiredHours: float = 18
    designationId: Optional[str] = None


class Qualification(BaseModel):
    facultyId: str
    subjectId: str


class Preference(BaseModel):
    facultyId: str
    preferredDay: Optional[str] = None
    preferredStartTime: Optional[str] = None
    preferredEndTime: Optional[str] = None


class UnavailabilityBlock(BaseModel):
    """H-14: a window during which a faculty member cannot be scheduled."""
    facultyId: str
    dayOfWeek: str
    startTime: str
    endTime: str
    reason: Optional[str] = None


class Room(BaseModel):
    roomId: str
    roomNumber: str
    building: Optional[str] = None
    roomType: str
    capacity: Optional[int] = None
    deptId: Optional[str] = None


class TimeSlot(BaseModel):
    day: str
    startTime: str
    endTime: str


class ExistingScheduleBlock(BaseModel):
    scheduleId: str
    facultyId: Optional[str] = None
    roomId: Optional[str] = None
    sectionId: Optional[str] = None
    day: str
    startTime: str
    endTime: str


class Config(BaseModel):
    operatingHoursStart: str = "07:00"
    operatingHoursEnd: str = "19:00"
    maxConsecutiveHours: int = 3
    lunchStart: str = "12:00"
    lunchEnd: str = "13:00"
    lectureBlockMinutes: int = 90
    labSplitHours: int = 3
    visitingLecturerMaxHours: int = 24
    defaultRequiredHours: int = 18
    labMinutesPerUnit: int = 180
    labMaxConsecutiveMinutes: int = 180
    consecutiveBlockPenalty: int = 0

class RoomPreference(BaseModel):
    """F3: a department's soft preference for a shared room."""
    deptId: str
    roomId: str
    priority: int = 1

class SolveRequest(BaseModel):
    termId: str
    deptId: str
    sections: List[Section]
    subjects: List[Subject]
    prospectus: List[ProspectusEntry]
    faculty: List[Faculty]
    qualifications: List[Qualification]
    preferences: List[Preference] = []
    unavailability: List[UnavailabilityBlock] = []
    rooms: List[Room]
    timeSlots: List[TimeSlot]
    config: Config
    existingSchedule: List[ExistingScheduleBlock] = []
    roomPreferences: List[RoomPreference] = []   # ← NEW (F3)


# ═══════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════

def time_to_min(t: str) -> int:
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def min_to_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def is_special_category(subject_code: str, prefixes_csv: str) -> bool:
    prefixes = [p.strip() for p in prefixes_csv.split(",") if p.strip()]
    return any(subject_code.startswith(p) for p in prefixes)


def compute_blocks(
    subject: Subject,
    prospectus: Optional[ProspectusEntry],
    config: Config,
) -> List[Dict]:
    """Return the list of physical blocks this subject needs.

    Uses the prospectus pattern when available. Falls back to config
    defaults if the prospectus entry is missing.
    """
    blocks: List[Dict] = []

    # ── Lecture ──
    if subject.lectureUnits > 0:
        n_sessions = prospectus.lecture_sessions_per_week if prospectus else 1
        mins_each = (
            prospectus.lecture_minutes_per_session
            if prospectus
            else config.lectureBlockMinutes
        )
        for i in range(n_sessions):
            blocks.append({
                "kind": "lecture",
                "durationMinutes": mins_each,
                "sessionIndex": i,
            })

    # ── Lab ──
    if subject.labUnits > 0:
        n_sessions = prospectus.lab_sessions_per_week if prospectus else 1
        mins_each = (
            prospectus.lab_minutes_per_session
            if prospectus
            else config.labMaxConsecutiveMinutes
        )
        for i in range(n_sessions):
            blocks.append({
                "kind": "lab",
                "durationMinutes": mins_each,
                "sessionIndex": i,
            })

    return blocks


def room_accepts_block(room: Room, kind: str, subject: Subject) -> bool:
    """R-1: room type rules.

    - Pure lecture subject:  lecture rooms (and labs allowed as fallback)
    - Pure lab subject:      laboratory / computer_lab
    - Mixed subject ('any'): the block kind decides
        - lab block     → laboratory / computer_lab
        - lecture block → lecture_room / computer_lab / laboratory
    - No required type set:  same as mixed ('any')
    """
    required = (subject.requiredRoomType or "").strip().lower()

    # Mixed subject or unset → kind decides
    if required in ("", "any"):
        if kind == "lab":
            return room.roomType in ("laboratory", "computer_lab")
        return room.roomType in ("lecture_room", "computer_lab", "laboratory")

    # Pure subject → strict match
    return room.roomType == subject.requiredRoomType


def blocks_overlap(start_a: int, dur_a: int, start_b: int, dur_b: int) -> bool:
    return start_a < start_b + dur_b and start_b < start_a + dur_a


# ═══════════════════════════════════════════
# Solver
# ═══════════════════════════════════════════

def solve_schedule(req: SolveRequest) -> dict:
    print(
        f"[solver] input: sections={len(req.sections)} subjects={len(req.subjects)} "
        f"slots={len(req.timeSlots)} rooms={len(req.rooms)} faculty={len(req.faculty)} "
        f"prospectus={len(req.prospectus)} quals={len(req.qualifications)} "
        f"existing={len(req.existingSchedule)} unavail={len(req.unavailability)}"
    )

    # ── DEBUG: show what patterns the solver received ──
    for p in req.prospectus[:5]:
        print(
            f"[solver]   prospectus subject={p.subjectId} "
            f"lec={p.lecture_sessions_per_week}×{p.lecture_minutes_per_session}m "
            f"lab={p.lab_sessions_per_week}×{p.lab_minutes_per_session}m"
        )

    model = cp_model.CpModel()

    subject_by_id = {s.subjectId: s for s in req.subjects}
    section_by_id = {s.sectionId: s for s in req.sections}
    qualified = {(q.facultyId, q.subjectId) for q in req.qualifications}

    section_subjects: Dict[str, List[str]] = {}
    for sec in req.sections:
        if not sec.programId or sec.yearLevel is None:
            section_subjects[sec.sectionId] = []
            continue
        section_subjects[sec.sectionId] = [
            p.subjectId
            for p in req.prospectus
            if p.programId == sec.programId and p.yearLevel == sec.yearLevel
        ]

    operating_start = time_to_min(req.config.operatingHoursStart)
    operating_end = time_to_min(req.config.operatingHoursEnd)

    X: Dict[tuple, cp_model.IntVar] = {}
    block_meta: Dict[tuple, Dict] = {}

    # Build a lookup: subjectId → prospectus entry (for pattern info)
    prospectus_by_subject: Dict[str, ProspectusEntry] = {}
    for p in req.prospectus:
        if p.subjectId not in prospectus_by_subject:
            prospectus_by_subject[p.subjectId] = p

    subject_blocks: Dict[str, List[Dict]] = {}
    for subj in req.subjects:
        prospectus = prospectus_by_subject.get(subj.subjectId)
        subject_blocks[subj.subjectId] = compute_blocks(subj, prospectus, req.config)

    # ── Variable creation ──
    for sec in req.sections:
        for subj_id in section_subjects.get(sec.sectionId, []):
            subj = subject_by_id.get(subj_id)
            if not subj:
                continue

            blocks = subject_blocks.get(subj_id, [])
            if not blocks:
                continue

            possible_faculty = [
                f for f in req.faculty if (f.facultyId, subj_id) in qualified
            ]
            if not possible_faculty:
                print(f"[solver] WARN: no qualified faculty for {subj.subjectCode}")
                continue

            for block in blocks:
                dur = block["durationMinutes"]
                kind = block["kind"]

                possible_rooms = [
                    r for r in req.rooms if room_accepts_block(r, kind, subj)
                ]
                if not possible_rooms:
                    print(f"[solver] WARN: no {kind} room for {subj.subjectCode}")
                    continue

                for slot in req.timeSlots:
                    start_min = time_to_min(slot.startTime)
                    if start_min < operating_start:
                        continue
                    if start_min + dur > operating_end:
                        continue

                    for room in possible_rooms:
                        for fac in possible_faculty:
                            key = (
                                sec.sectionId,
                                subj_id,
                                kind,
                                block["sessionIndex"],
                                slot.day,
                                start_min,
                                room.roomId,
                                fac.facultyId,
                            )
                            X[key] = model.NewBoolVar(
                                f"x_{sec.sectionId[:6]}_{subj_id}_{kind}{block['sessionIndex']}_"
                                f"{slot.day[:3]}_{start_min}_{room.roomId}_{fac.facultyId}"
                            )
                            block_meta[key] = {
                                "durationMinutes": dur,
                                "kind": kind,
                            }

    print(f"[solver] variables created: {len(X)}")

    if not X:
        return {
            "status": "infeasible",
            "message": "No viable assignments — check faculty qualifications and room types.",
            "solveTimeSeconds": 0,
            "unscheduled": [],
        }

    # ═══════════════════════════════════════════
    # Constraint groups
    # ═══════════════════════════════════════════

    block_group: Dict[tuple, List] = defaultdict(list)
    fac_day: Dict[tuple, List] = defaultdict(list)
    room_day: Dict[tuple, List] = defaultdict(list)
    sec_day: Dict[tuple, List] = defaultdict(list)
    fac_all_vars: Dict[str, List] = defaultdict(list)

    for k, v in X.items():
        sec_id, subj_id, kind, sess_idx, day, start_min, room_id, fac_id = k
        dur = block_meta[k]["durationMinutes"]
        block_group[(sec_id, subj_id, kind, sess_idx)].append(v)
        fac_day[(fac_id, day)].append((v, start_min, dur))
        room_day[(room_id, day)].append((v, start_min, dur))
        sec_day[(sec_id, day)].append((v, start_min, dur))
        fac_all_vars[fac_id].append((v, dur))

    # ── SOFT: every block should be scheduled ──
    unscheduled_vars: List[tuple] = []
    for group_key, vs in block_group.items():
        model.Add(sum(vs) <= 1)
        unscheduled = model.NewBoolVar(
            f"un_{group_key[0]}_{group_key[1]}_{group_key[2]}{group_key[3]}"
        )
        model.Add(sum(vs) + unscheduled == 1)
        unscheduled_vars.append((unscheduled, group_key))

    # ── HARD: overlap-aware constraints (BUCKETED) ──
    def add_bucketed_exclusion(
        day_index: Dict[tuple, List],
        granularity: int = 30,
    ):
        slot_index: Dict[tuple, List] = defaultdict(list)
        for (entity_id, day), entries in day_index.items():
            for (v, start, dur) in entries:
                slot = start
                while slot < start + dur:
                    slot_index[(entity_id, day, slot)].append(v)
                    slot += granularity

        for vs in slot_index.values():
            if len(vs) > 1:
                model.Add(sum(vs) <= 1)

    add_bucketed_exclusion(fac_day)
    add_bucketed_exclusion(room_day)
    add_bucketed_exclusion(sec_day)

    # ── HARD: same-subject sessions must be on different days ──
    # For a given (section, subject, kind), each session must land on a
    # distinct day. This prevents 2 lecture sessions from stacking on
    # Monday when they should be Mon+Thu or Tue+Fri.
    session_by_day: Dict[tuple, List] = defaultdict(list)
    for k, v in X.items():
        sec_id, subj_id, kind, sess_idx, day, start_min, room_id, fac_id = k
        session_by_day[(sec_id, subj_id, kind, day)].append(v)

    # Group by (section, subject, kind) → list of (day, [vars for that day])
    grouped: Dict[tuple, Dict[str, List]] = defaultdict(lambda: defaultdict(list))
    for (sec_id, subj_id, kind, day), vars_list in session_by_day.items():
        grouped[(sec_id, subj_id, kind)][day] = vars_list

    # For each subject-in-section-in-kind, at most one session per day
    for key, day_vars in grouped.items():
        for day, vars_list in day_vars.items():
            if len(vars_list) > 0:
                model.Add(sum(vars_list) <= 1)

    # ── HARD: existing schedule lock ──
    for existing in req.existingSchedule:
        ex_day = existing.day
        ex_start = time_to_min(existing.startTime)
        ex_end = time_to_min(existing.endTime)
        ex_dur = ex_end - ex_start

        for k, v in X.items():
            sec_id, subj_id, kind, sess_idx, day, start_min, room_id, fac_id = k
            if day != ex_day:
                continue
            dur = block_meta[k]["durationMinutes"]
            if not blocks_overlap(start_min, dur, ex_start, ex_dur):
                continue

            if (
                (existing.facultyId and fac_id == existing.facultyId)
                or (existing.roomId and room_id == existing.roomId)
                or (existing.sectionId and sec_id == existing.sectionId)
            ):
                model.Add(v == 0)

    # ── HARD: faculty unavailability (H-14) ──
    # For each faculty member with declared blocks, forbid any variable
    # that would schedule them during a blocked window.
    unavail_by_fac: Dict[str, List[UnavailabilityBlock]] = defaultdict(list)
    for u in req.unavailability:
        unavail_by_fac[u.facultyId].append(u)

    unavail_forbidden = 0
    for k, v in X.items():
        sec_id, subj_id, kind, sess_idx, day, start_min, room_id, fac_id = k
        blocks = unavail_by_fac.get(fac_id)
        if not blocks:
            continue
        dur = block_meta[k]["durationMinutes"]
        end_min = start_min + dur
        for u in blocks:
            if u.dayOfWeek != day:
                continue
            u_start = time_to_min(u.startTime)
            u_end = time_to_min(u.endTime)
            # Half-open interval overlap: [start, end)
            if start_min < u_end and u_start < end_min:
                model.Add(v == 0)
                unavail_forbidden += 1
                break

    if unavail_forbidden:
        print(
            f"[solver] H-14: forbade {unavail_forbidden} candidate(s) "
            f"across {len(unavail_by_fac)} faculty member(s)"
        )

    # ── HARD: visiting lecturer max hours ──
    visiting_cap = int(req.config.visitingLecturerMaxHours) * 60
    for fac in req.faculty:
        if fac.classification != "visiting_lecturer":
            continue
        entries = fac_all_vars.get(fac.facultyId, [])
        if not entries:
            continue
        cap_minutes = (
            int(fac.requiredHours) * 60
            if fac.requiredHours and fac.requiredHours > 0
            else visiting_cap
        )
        cap_minutes = min(cap_minutes, visiting_cap)
        model.Add(sum(v * dur for v, dur in entries) <= cap_minutes)

    # ── SOFT: lunch break penalty ──
    lunch_start = time_to_min(req.config.lunchStart)
    lunch_end = time_to_min(req.config.lunchEnd)
    lunch_penalties = []
    for k, v in X.items():
        start_min = k[5]
        dur = block_meta[k]["durationMinutes"]
        if start_min < lunch_end and start_min + dur > lunch_start:
            lunch_penalties.append(v)

    # ── SOFT: faculty time preference ──
    pref_map: Dict[str, List[Preference]] = defaultdict(list)
    for p in req.preferences:
        pref_map[p.facultyId].append(p)

    pref_penalties = []
    for k, v in X.items():
        fac_id = k[7]
        day = k[4]
        prefs = pref_map.get(fac_id, [])
        if prefs and not any(p.preferredDay == day for p in prefs):
            pref_penalties.append(v)

    # ── OBJECTIVE ──
    objective_terms = []
    if unscheduled_vars:
        objective_terms.append(1000 * sum(u for u, _ in unscheduled_vars))
    if lunch_penalties:
        objective_terms.append(10 * sum(lunch_penalties))
    if pref_penalties:
        objective_terms.append(5 * sum(pref_penalties))

    # ── F3: room preferences ──
    # Reward placements in a dept-preferred room.
    # Priority 1 = small nudge; priority 3 = strong push.
    # CP-SAT minimizes, so we subtract to reward.
    if req.roomPreferences:
        pref_lookup: Dict[tuple, int] = {}
        for p in req.roomPreferences:
            pref_lookup[(p.deptId, p.roomId)] = p.priority

        room_pref_reward = 0
        reward_count = 0
        for k, v in X.items():
            _, _, _, _, _, _, room_id, _ = k
            weight = pref_lookup.get((req.deptId, room_id))
            if weight:
                room_pref_reward += v * weight
                reward_count += 1

        # ⚠️ Test the Python int (reward_count), not the CP-SAT
        # linear expression (room_pref_reward). Testing the expression
        # as a bool triggers a RecursionError inside OR-Tools.
        if reward_count > 0:
            objective_terms.append(-2 * room_pref_reward)
            print(
                f"[solver] F3: {len(req.roomPreferences)} room preference(s), "
                f"{reward_count} candidate placements rewarded"
            )
        else:
            print(
                f"[solver] F3: {len(req.roomPreferences)} room preference(s), "
                f"0 candidate placements matched any scheduled block"
            )

    # ── SOFT: H-4 consecutive-block penalty ──
    # Penalize placements that produce 3+ consecutive 30-min buckets
    # for the same faculty on the same day.
    #
    # Approach: for each (faculty, day), build a bucketed slot index
    # (like add_bucketed_exclusion). If 3+ candidates could co-occupy
    # an adjacent run, add a soft penalty on the "extra" variables.
    #
    # We use CP-SAT linear sums only — no variable multiplication.
    consecutive_penalty_weight = 3  # soft nudge, well below unscheduled=1000
    max_consec_min = req.config.maxConsecutiveHours * 60
    consecutive_penalty_terms = []

    # Rebuild a slot index for faculty (same as add_bucketed_exclusion)
    fac_slot_index: Dict[tuple, List] = defaultdict(list)
    for (fac_id, day), entries in fac_day.items():
        for (v, start, dur) in entries:
            slot = start
            while slot < start + dur:
                fac_slot_index[(fac_id, day, slot)].append(v)
                slot += 30

    # For each (faculty, day), find 30-min windows where 3+ consecutive
    # slots are occupied. Count via "consecutive triple" detection.
    # Simple approach: penalize the SUM of variables in every
    # 3-consecutive-slot window that exceeds the max consecutive limit.
    seen_windows = set()
    for (fac_id, day, slot), vars_list in fac_slot_index.items():
        # A "3-slot window" starting at this slot covers [slot, slot+90)
        window_key = (fac_id, day, slot)
        if window_key in seen_windows:
            continue
        seen_windows.add(window_key)

        # Gather all candidates that touch any slot in this 90-min window
        window_vars = set()
        for offset in (0, 30, 60):
            window_vars.update(
                fac_slot_index.get((fac_id, day, slot + offset), [])
            )

        # If 3+ candidates could fit consecutively here, add a small
        # penalty per candidate. This won't forbid the placement — just
        # disincentivizes it.
        if len(window_vars) >= 3:
            for v in window_vars:
                consecutive_penalty_terms.append(v)

    if consecutive_penalty_terms:
        # Deduplicate — a candidate can appear in many overlapping
        # windows; without this, the penalty weight scales non-linearly
        # with chain length.
        unique_terms = list(set(consecutive_penalty_terms))
        objective_terms.append(
            consecutive_penalty_weight * sum(unique_terms)
        )
        print(
            f"[solver] H-4: {len(unique_terms)} candidate(s) "
            f"penalized for consecutive-block risk"
        )
    
    if objective_terms:
        
        model.Minimize(sum(objective_terms))

    # ── SOLVE ──
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    solver.parameters.num_workers = 8

    status = solver.Solve(model)

    status_name = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN",
    }.get(status, str(status))

    print(f"[solver] status={status_name} wall_time={solver.WallTime():.2f}s")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "infeasible",
            "message": "No valid schedule exists with the current constraints.",
            "solveTimeSeconds": solver.WallTime(),
            "solveStatus": status_name,
            "unscheduled": [],
        }

    # ── Extract schedule ──
    schedule = []
    for k, v in X.items():
        if solver.Value(v) == 1:
            sec_id, subj_id, kind, sess_idx, day, start_min, room_id, fac_id = k
            dur = block_meta[k]["durationMinutes"]
            end_str = min_to_hhmm(start_min + dur)
            schedule.append({
                "sectionId": sec_id,
                "sectionCode": section_by_id[sec_id].sectionCode,
                "subjectId": subj_id,
                "facultyId": fac_id,
                "roomId": room_id,
                "day": day,
                "startTime": min_to_hhmm(start_min),
                "endTime": end_str,
                "loadType": "laboratory" if kind == "lab" else "lecture",
            })

    # ── Collect unscheduled blocks ──
    unscheduled_list = []
    for u, group_key in unscheduled_vars:
        if solver.Value(u) == 1:
            sec_id, subj_id, kind, sess_idx = group_key
            subj = subject_by_id.get(subj_id)
            sec = section_by_id.get(sec_id)
            unscheduled_list.append({
                "sectionId": sec_id,
                "sectionCode": sec.sectionCode if sec else "?",
                "subjectId": subj_id,
                "subjectCode": subj.subjectCode if subj else "?",
                "kind": kind,
                "sessionIndex": sess_idx,
            })

    print(
        f"[solver] assigned={len(schedule)}/{len(block_group)} blocks, "
        f"unscheduled={len(unscheduled_list)}"
    )

    return {
        "status": "success",
        "solveTimeSeconds": solver.WallTime(),
        "schedule": schedule,
        "unscheduled": unscheduled_list,
        "solveStatus": status_name,
    }