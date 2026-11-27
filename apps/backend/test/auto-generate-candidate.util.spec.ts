import {
  buildAutoGenerateToken,
  candidateFingerprint,
  normalizeCandidatePlacement,
  verifyAutoGenerateToken,
} from '../src/modules/scheduling/services/auto-generate-candidate.util';

describe('auto-generate-candidate.util', () => {
  it('normalizes visible placement without sessionIndex', () => {
    const base = [
      {
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        loadType: 'lecture',
        day: 'Monday',
        startTime: '08:00',
        sessionIndex: 0,
        roomId: 'room-a',
        facultyId: 'fac-a',
      },
      {
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        loadType: 'lecture',
        day: 'Wednesday',
        startTime: '08:00',
        sessionIndex: 1,
        roomId: 'room-b',
        facultyId: 'fac-b',
      },
    ];

    const permutedSessions = [
      { ...base[1], sessionIndex: 99 },
      { ...base[0], sessionIndex: 42 },
    ];
    const differentDay = [
      base[0],
      { ...base[1], day: 'Friday' },
    ];

    expect(normalizeCandidatePlacement(permutedSessions)).toBe(
      normalizeCandidatePlacement(base),
    );
    expect(normalizeCandidatePlacement(differentDay)).not.toBe(
      normalizeCandidatePlacement(base),
    );
  });

  it('builds and verifies a generation token', () => {
    const input = {
      termId: 'term-1',
      deptId: 'dept-1',
      userId: 'user-1',
      generatedAt: '2026-11-27T10:00:00.000Z',
      fingerprint: candidateFingerprint(
        [
          {
            sectionId: 'sec-1',
            subjectId: 'sub-1',
            loadType: 'lecture',
            day: 'Monday',
            startTime: '08:00',
          },
        ],
        [
          {
            sectionId: 'sec-1',
            subjectId: 'sub-2',
            kind: 'lecture',
            sessionIndex: 0,
          },
        ],
      ),
    };

    const token = buildAutoGenerateToken(input);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(verifyAutoGenerateToken(token, input)).toBe(true);
    expect(
      verifyAutoGenerateToken(token, { ...input, deptId: 'dept-other' }),
    ).toBe(false);
    expect(
      verifyAutoGenerateToken(token, {
        ...input,
        fingerprint: `${input.fingerprint}-changed`,
      }),
    ).toBe(false);
  });
});
