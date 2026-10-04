import { api } from './client';

export interface RoomRecord {
  roomId: string;
  roomNumber: string;
  building: string;
  roomType: string;
  capacity: number | null;
  deptId: string | null;
}

export async function fetchRooms(): Promise<RoomRecord[]> {
  const { data } = await api.get('/v1/rooms');
  return data.data;
}