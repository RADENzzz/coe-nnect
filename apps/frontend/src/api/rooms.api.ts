import { api } from './client';

export type RoomType =
  | 'lecture_room'
  | 'laboratory'
  | 'computer_lab'
  | 'drafting_room'
  | 'other';

export interface RoomRecord {
  roomId: string;
  roomNumber: string;
  building: string;
  roomType: RoomType;
  capacity: number | null;
  deptId: string | null;
  isActive: boolean;
}

export interface CreateRoomInput {
  roomNumber: string;
  building: string;
  roomType: RoomType;
  capacity?: number;
  deptId?: string | null;   // null = shared
}

export async function fetchRooms(
  includeInactive: boolean = false,
): Promise<RoomRecord[]> {
  const params = includeInactive === true ? { includeInactive: 'true' } : {};
  const { data } = await api.get('/v1/rooms', { params });
  return data.data;
}

export async function createRoom(
  input: CreateRoomInput,
): Promise<RoomRecord> {
  const { data } = await api.post('/v1/rooms', input);
  return data.data;
}

export async function updateRoom(
  id: string,
  input: Partial<CreateRoomInput>,
): Promise<RoomRecord> {
  const { data } = await api.patch(`/v1/rooms/${id}`, input);
  return data.data;
}

export async function toggleRoomActive(id: string): Promise<RoomRecord> {
  const { data } = await api.patch(`/v1/rooms/${id}/toggle-active`);
  return data.data;
}

export async function deleteRoom(id: string): Promise<void> {
  await api.delete(`/v1/rooms/${id}`);
}

// ────────────────────────────────────────────
// F3 — Room preferences
// ────────────────────────────────────────────

export interface RoomPreferenceRecord {
  preferenceId: string;
  roomId: string;
  deptId: string;
  deptCode: string;
  deptName: string;
  priority: number;
  createdBy: string | null;
  createdAt: string;
}

export interface UpsertRoomPreferenceInput {
  roomId: string;
  deptId: string;
  priority?: number;
}

export async function fetchRoomPreferences(
  roomId: string,
): Promise<RoomPreferenceRecord[]> {
  const { data } = await api.get('/v1/rooms/preferences', {
    params: { roomId },
  });
  return data.data;
}

export async function upsertRoomPreference(
  input: UpsertRoomPreferenceInput,
): Promise<RoomPreferenceRecord> {
  const { data } = await api.post('/v1/rooms/preferences', input);
  return data.data;
}

export async function deleteRoomPreference(
  preferenceId: string,
): Promise<{ success: boolean }> {
  const { data } = await api.delete(
    `/v1/rooms/preferences/${preferenceId}`,
  );
  return data;
}