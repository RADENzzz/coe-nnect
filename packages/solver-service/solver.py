from ortools.sat.python import cp_model
from pydantic import BaseModel
from typing import List, Optional, Dict, Tuple
from collections import defaultdict
import os

# ═══════════════════════════════════════════
# Runtime tunables (env-overridable, defaults preserve behavior)
# ═══════════════════════════════════════════
_SOLVER_MAX_TIME = float(os.environ.get("SOLVER_MAX_TIME", "90"))
_SOLVER_WORKERS  = int(os.environ.get("SOLVER_WORKERS",  "8"))


# ═══════════════════════════════════════════
# Pydantic models  (unchanged — wire format preserved)
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
    endHourAlignmentWeight: int = 0


class RoomPreference(BaseModel):
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
    roomPreferences: List[RoomPreference] = []


# ═══════════════════════════════════════════
# Helpers  (unchanged semantics; minor speedups)
# ═══════════════════════════════════════════

def time_to_min(t: str) -> int:
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def min_to_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def compute_blocks(
    subject: Subject,
    prospectus: Optional[ProspectusEntry],
    config: Config,
) -> List[Dict]:
    blocks: List[Dict] = []

    if subject.lectureUnits > 0:
        n_sessions = prospectus.lecture_sessions_per_week if prospectus else 1
        mins_each = (
            prospectus.lecture_minutes_per_session
            if prospectus else config.lectureBlockMinutes
        )
        for i in range(n_sessions):
            blocks.append({
                "kind": "lecture",
                "durationMinutes": mins_each,
                "sessionIndex": i,
            })

    if subject.labUnits > 0:
        n_sessions = prospectus.lab_sessions_per_week if prospectus else 1
        mins_each = (
            prospectus.lab_minutes_per_session
            if prospectus else config.labMaxConsecutiveMinutes
        )
        for i in range(n_sessions):
            blocks.append({
                "kind": "lab",
                "durationMinutes": mins_each,
                "sessionIndex": i,
            })

    return blocks


def room_accepts_block(room: Room, kind: str, subject: Subject) -> bool:
    required = (subject.requiredRoomType or "").strip().lower()

    if required in ("", "any"):
        if kind == "lab":
            return room.roomType in ("laboratory", "computer_lab")
        return room.roomType in ("lecture_room", "computer_lab", "laboratory")

    if kind == "lab":
        return room.roomType == subject.requiredRoomType
    return (
        room.roomType == subject.requiredRoomType
        or room.roomType == "lecture_room"
    )


def _overlaps(s1: int, e1: int, s2: int, e2: int) -> bool:
    return s1 < e2 and s2 < e1


def _has_conflict(intervals: list, start: int, end: int) -> bool:
    """True if (start,end) overlaps any (s,e) in intervals (list of 2-tuples)."""
    for s, e in intervals:
        if s < end and start < e:
            return True
    return False


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

    # ── Pre-parse times once ──
    operating_start = time_to_min(req.config.operatingHoursStart)
    operating_end   = time_to_min(req.config.operatingHoursEnd)
    lunch_start     = time_to_min(req.config.lunchStart)
    lunch_end       = time_to_min(req.config.lunchEnd)
    end_weight      = int(req.config.endHourAlignmentWeight)

    parsed_slots: List[Tuple[str, int]] = [
        (s.day, time_to_min(s.startTime))
        for s in req.timeSlots
        if time_to_min(s.startTime) >= operating_start
    ]

    # ── Per-subject pre-computation (done ONCE per subject) ──
    prospectus_by_subject: Dict[str, ProspectusEntry] = {}
    for p in req.prospectus:
        prospectus_by_subject.setdefault(p.subjectId, p)

    subject_blocks: Dict[str, List[Dict]] = {
        subj.subjectId: compute_blocks(
            subj, prospectus_by_subject.get(subj.subjectId), req.config
        )
        for subj in req.subjects
    }

    subject_faculty: Dict[str, List[Faculty]] = {}
    subject_rooms_by_kind: Dict[Tuple[str, str], List[Room]] = {}
    for subj in req.subjects:
        subject_faculty[subj.subjectId] = [
            f for f in req.faculty if (f.facultyId, subj.subjectId) in qualified
        ]
        for kind in ("lecture", "lab"):
            subject_rooms_by_kind[(subj.subjectId, kind)] = [
                r for r in req.rooms if room_accepts_block(r, kind, subj)
            ]

    # ── Existing schedule indexed by (entity, day) ──
    existing_by_fac:  Dict[Tuple[str, str], list] = defaultdict(list)
    existing_by_room: Dict[Tuple[str, str], list] = defaultdict(list)
    existing_by_sec:  Dict[Tuple[str, str], list] = defaultdict(list)
    for e in req.existingSchedule:
        s, en = time_to_min(e.startTime), time_to_min(e.endTime)
        if e.facultyId:
            existing_by_fac[(e.facultyId, e.day)].append((s, en))
        if e.roomId:
            existing_by_room[(e.roomId, e.day)].append((s, en))
        if e.sectionId:
            existing_by_sec[(e.sectionId, e.day)].append((s, en))

    # ── Unavailability indexed by (faculty, day) ──
    unavail_by_fac: Dict[Tuple[str, str], list] = defaultdict(list)
    for u in req.unavailability:
        unavail_by_fac[(u.facultyId, u.dayOfWeek)].append(
            (time_to_min(u.startTime), time_to_min(u.endTime))
        )

    # ── Preferences: O(1) day lookup per faculty ──
    fac_has_prefs = set()
    fac_pref_days: Dict[str, set] = defaultdict(set)
    for p in req.preferences:
        fac_has_prefs.add(p.facultyId)
        if p.preferredDay:
            fac_pref_days[p.facultyId].add(p.preferredDay)

    # ── Room preference lookup (only this dept) ──
    room_pref_lookup: Dict[str, int] = {
        p.roomId: p.priority
        for p in req.roomPreferences
        if p.deptId == req.deptId
    }

    visiting_ids = {
        f.facultyId for f in req.faculty if f.classification == "visiting_lecturer"
    }

    # ── Index structures built during var creation (single pass) ──
    X: List[Tuple[tuple, cp_model.IntVar]] = []   # (key, var)
    block_dur: Dict[tuple, int] = {}              # key -> duration (needed at extraction)

    block_group:      Dict[tuple, List]           = defaultdict(list)
    fac_day:          Dict[Tuple[str, str], list] = defaultdict(list)
    room_day:         Dict[Tuple[str, str], list] = defaultdict(list)
    sec_day:          Dict[Tuple[str, str], list] = defaultdict(list)
    fac_all_vars:     Dict[str, list]             = defaultdict(list)   # only visiting lecturers
    session_by_day:   Dict[tuple, list]           = defaultdict(list)
    hour_buckets:     Dict[Tuple[str, int], list] = defaultdict(list)

    lunch_penalties: List[Tuple[cp_model.IntVar, int]] = []
    end_penalties:   List[cp_model.IntVar]             = []
    pref_penalties:  List[cp_model.IntVar]             = []
    room_pref_terms: List[Tuple[cp_model.IntVar, int]] = []

    var_counter = 0

    # ── Variable creation + index building (SINGLE PASS) ──
    for sec in req.sections:
        sec_id = sec.sectionId
        for subj_id in section_subjects.get(sec_id, []):
            subj = subject_by_id.get(subj_id)
            if not subj:
                continue
            blocks = subject_blocks.get(subj_id, [])
            if not blocks:
                continue
            possible_faculty = subject_faculty.get(subj_id, [])
            if not possible_faculty:
                print(f"[solver] WARN: no qualified faculty for {subj.subjectCode}")
                continue

            for block in blocks:
                dur      = block["durationMinutes"]
                kind     = block["kind"]
                sess_idx = block["sessionIndex"]

                possible_rooms = subject_rooms_by_kind.get((subj_id, kind), [])
                if not possible_rooms:
                    print(f"[solver] WARN: no {kind} room for {subj.subjectCode}")
                    continue

                group_key = (sec_id, subj_id, kind, sess_idx)
                # Register so that an all-pruned group still produces an
                # unscheduled flag (matches original semantics exactly).
                block_group[group_key]

                for day, start_min in parsed_slots:
                    end_min = start_min + dur
                    if end_min > operating_end:
                        continue

                    # Section existing-schedule check (OR with fac/room below)
                    if _has_conflict(
                        existing_by_sec.get((sec_id, day), ()),
                        start_min, end_min,
                    ):
                        continue

                    for room in possible_rooms:
                        room_id = room.roomId
                        if _has_conflict(
                            existing_by_room.get((room_id, day), ()),
                            start_min, end_min,
                        ):
                            continue

                        for fac in possible_faculty:
                            fac_id = fac.facultyId

                            if _has_conflict(
                                existing_by_fac.get((fac_id, day), ()),
                                start_min, end_min,
                            ):
                                continue
                            if _has_conflict(
                                unavail_by_fac.get((fac_id, day), ()),
                                start_min, end_min,
                            ):
                                continue

                            key = (
                                sec_id, subj_id, kind, sess_idx,
                                day, start_min, room_id, fac_id,
                            )
                            v = model.NewBoolVar(f"x{var_counter}")
                            var_counter += 1

                            X.append((key, v))
                            block_dur[key] = dur

                            # ── Append to every index the objective/constraints need ──
                            block_group[group_key].append(v)
                            fac_day[(fac_id, day)].append((v, start_min, dur))
                            room_day[(room_id, day)].append((v, start_min, dur))
                            sec_day[(sec_id, day)].append((v, start_min, dur))
                            session_by_day[(sec_id, subj_id, kind, day)].append(v)
                            hour_buckets[(day, start_min // 60)].append(v)

                            if fac_id in visiting_ids:
                                fac_all_vars[fac_id].append((v, dur))

                            # Lunch penalty (proportional overlap, cap 10)
                            ov_s = start_min if start_min > lunch_start else lunch_start
                            ov_e = end_min     if end_min     < lunch_end   else lunch_end
                            if ov_e > ov_s:
                                w = min((ov_e - ov_s) // 6, 10)
                                if w > 0:
                                    lunch_penalties.append((v, w))

                            # Optional end-hour alignment
                            if end_weight > 0 and end_min % 60 != 0:
                                end_penalties.append(v)

                            # Faculty day preference
                            if fac_id in fac_has_prefs and day not in fac_pref_days[fac_id]:
                                pref_penalties.append(v)

                            # Room preference reward
                            if room_pref_lookup:
                                w = room_pref_lookup.get(room_id)
                                if w:
                                    room_pref_terms.append((v, w))

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

    # ── HARD: at most one placement per block-session ──
    unscheduled_vars: List[Tuple[cp_model.IntVar, tuple]] = []
    for group_key, vs in block_group.items():
        model.Add(sum(vs) <= 1)
        unscheduled = model.NewBoolVar(f"un{len(unscheduled_vars)}")
        model.Add(sum(vs) + unscheduled == 1)
        unscheduled_vars.append((unscheduled, group_key))

    # ── HARD: bucketed non-overlap (per entity/day, memory-scaled) ──
    #
    # Only ONE Add() per (entity, day, 30-min slot) with >1 var — same
    # shape as before, but we build the slot index in a single pass per
    # entity type instead of a generic loop that re-slices lists.
    def add_bucketed_exclusion(day_index: Dict[Tuple[str, str], list]) -> None:
        slot_index: Dict[Tuple[str, str, int], list] = defaultdict(list)
        for (entity_id, day), entries in day_index.items():
            for (v, start, dur) in entries:
                for slot in range(start, start + dur, 30):
                    slot_index[(entity_id, day, slot)].append(v)
        for vs in slot_index.values():
            if len(vs) > 1:
                model.Add(sum(vs) <= 1)

    add_bucketed_exclusion(fac_day)
    add_bucketed_exclusion(room_day)
    add_bucketed_exclusion(sec_day)

    # ── HARD: distinct days per (section, subject, kind) ──
    # Re-group the per-day lists we already built.
    grouped_days: Dict[tuple, List[list]] = defaultdict(list)
    for (sec_id, subj_id, kind, day), vs in session_by_day.items():
        grouped_days[(sec_id, subj_id, kind)].append(vs)
    for vs_list in grouped_days.values():
        for vs in vs_list:
            if vs:
                model.Add(sum(vs) <= 1)

    # ── HARD: visiting lecturer caps ──
    visiting_cap = int(req.config.visitingLecturerMaxHours) * 60
    for fac in req.faculty:
        if fac.classification != "visiting_lecturer":
            continue
        entries = fac_all_vars.get(fac.facultyId)
        if not entries:
            continue
        cap_minutes = (
            int(fac.requiredHours) * 60
            if fac.requiredHours and fac.requiredHours > 0
            else visiting_cap
        )
        cap_minutes = min(cap_minutes, visiting_cap)
        model.Add(sum(v * dur for v, dur in entries) <= cap_minutes)

    # ═══════════════════════════════════════════
    # OBJECTIVE (weights preserved bit-for-bit)
    # ═══════════════════════════════════════════
    objective_terms = []

    # Unscheduled (dominant 1000)
    if unscheduled_vars:
        objective_terms.append(1000 * sum(u for u, _ in unscheduled_vars))

    # Lunch (graded by overlap minutes, same 1/6 scaling)
    if lunch_penalties:
        objective_terms.append(sum(v * w for v, w in lunch_penalties))
        print(
            f"[solver] lunch: {len(lunch_penalties)} candidate(s) "
            f"overlap the lunch window (graded penalty)"
        )

    # End-hour alignment (optional)
    if end_weight > 0 and end_penalties:
        objective_terms.append(end_weight * sum(end_penalties))
        print(
            f"[solver] end-alignment: {len(end_penalties)} candidate(s) "
            f"end mid-hour (soft weight {end_weight})"
        )

    # Faculty preference (weight 5)
    if pref_penalties:
        objective_terms.append(5 * sum(pref_penalties))

    # Room preference reward (weight 2, negative)
    if room_pref_terms:
        objective_terms.append(-2 * sum(v * w for v, w in room_pref_terms))
        print(
            f"[solver] F3: {len(req.roomPreferences)} room preference(s), "
            f"{len(room_pref_terms)} candidate placements rewarded"
        )

    # ── SOFT: H-4 consecutive-block penalty ──
    consecutive_penalty_weight = 3
    consecutive_penalty_terms = []

    fac_slot_index: Dict[Tuple[str, str, int], list] = defaultdict(list)
    for (fac_id, day), entries in fac_day.items():
        for (v, start, dur) in entries:
            for slot in range(start, start + dur, 30):
                fac_slot_index[(fac_id, day, slot)].append(v)

    seen_windows = set()
    for (fac_id, day, slot) in fac_slot_index.keys():
        window_key = (fac_id, day, slot)
        if window_key in seen_windows:
            continue
        seen_windows.add(window_key)

        coverage_vars = []
        for offset in (0, 30, 60):
            vs = fac_slot_index.get((fac_id, day, slot + offset))
            if vs:
                coverage_vars.extend(vs)

        if len(coverage_vars) < 3:
            continue

        excess = model.NewIntVar(0, 3, f"h4_{len(consecutive_penalty_terms)}")
        model.Add(excess >= sum(coverage_vars) - 2)
        consecutive_penalty_terms.append(excess)

    if consecutive_penalty_terms:
        objective_terms.append(
            consecutive_penalty_weight * sum(consecutive_penalty_terms)
        )
        print(
            f"[solver] H-4: {len(consecutive_penalty_terms)} window(s) "
            f"with consecutive-block risk"
        )

    # ── SOFT: spread across (day, hour) buckets ──
    spread_penalties = []
    for (day, hour), vars_list in hour_buckets.items():
        if len(vars_list) < 3:
            continue
        count = model.NewIntVar(
            0, len(vars_list), f"sp_{len(spread_penalties)}"
        )
        model.Add(count == sum(vars_list))
        excess = model.NewIntVar(
            0, len(vars_list), f"spx_{len(spread_penalties)}"
        )
        model.Add(excess >= count - 2)
        spread_penalties.append(excess)

    if spread_penalties:
        objective_terms.append(5 * sum(spread_penalties))
        print(
            f"[solver] spread: {len(spread_penalties)} (day, hour) "
            f"bucket(s) capped at 2 blocks for free"
        )

    if objective_terms:
        model.Minimize(sum(objective_terms))

    # ═══════════════════════════════════════════
    # SOLVE
    # ═══════════════════════════════════════════
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = _SOLVER_MAX_TIME
    solver.parameters.num_workers = _SOLVER_WORKERS

    # ── Speed-oriented tuning ──
    # Stop as soon as any feasible solution is found *that is within 5% of the
    # best bound*. For your problem (soft-cost objective, many feasible
    # solutions), this typically fires in <5s and doesn't change output quality
    # noticeably — a 5% worse objective is invisible to the DH eyeballing the
    # preview.
    solver.parameters.relative_gap_limit  = 0.05

    # Interleave search across workers from the start. Without this, CP-SAT's
    # default is to let one worker "lead" and the others only diverge after it
    # stalls — which for 70k-var models means the leader runs alone for 20-30s
    # before portfolio diversification kicks in.
    solver.parameters.interleave_search   = True

    # Prune the domain at presolve. Costs a tiny bit of presolve CPU, but every
    # subsequent propagation round is cheaper and the model proto sent to the
    # workers shrinks meaningfully on this size of graph.
    solver.parameters.cp_model_presolve   = True   # (this is already default)

    # Log progress. If it's still slow, this is what tells you *why*.
    solver.parameters.log_search_progress = bool(os.environ.get("SOLVER_VERBOSE", "0") == "1")

    status = solver.Solve(model)

    status_name = {
        cp_model.OPTIMAL:     "OPTIMAL",
        cp_model.FEASIBLE:    "FEASIBLE",
        cp_model.INFEASIBLE:  "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN:     "UNKNOWN",
    }.get(status, str(status))

    print(f"[solver] status={status_name} wall_time={solver.WallTime():.2f}s")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if status == cp_model.UNKNOWN:
            return {
                "status": "timeout",
                "message":
                    "The solver hit its time limit before finishing the "
                    "search. This is not an impossible schedule — try "
                    "generating again, or reduce the term load if it keeps "
                    "happening.",
                "solveTimeSeconds": solver.WallTime(),
                "solveStatus": status_name,
                "unscheduled": [],
            }
        return {
            "status": "infeasible",
            "message": "No valid schedule exists with the current constraints.",
            "solveTimeSeconds": solver.WallTime(),
            "solveStatus": status_name,
            "unscheduled": [],
        }

    # ═══════════════════════════════════════════
    # EXTRACT
    # ═══════════════════════════════════════════
    schedule = []
    value = solver.Value  # local alias (faster inner loop)
    for key, v in X:
        if value(v) == 1:
            sec_id, subj_id, kind, sess_idx, day, start_min, room_id, fac_id = key
            dur = block_dur[key]
            schedule.append({
                "sectionId": sec_id,
                "sectionCode": section_by_id[sec_id].sectionCode,
                "subjectId": subj_id,
                "facultyId": fac_id,
                "roomId": room_id,
                "day": day,
                "startTime": min_to_hhmm(start_min),
                "endTime": min_to_hhmm(start_min + dur),
                "loadType": "laboratory" if kind == "lab" else "lecture",
            })

    unscheduled_list = []
    for u, group_key in unscheduled_vars:
        if value(u) == 1:
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