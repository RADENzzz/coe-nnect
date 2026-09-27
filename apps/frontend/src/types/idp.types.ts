export interface IdpFaculty {
  wmsu_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  dept_code: string;
  classification: string;
  required_hours: number;
  is_active: boolean;
  last_synced_at: string;
}

export interface IdpSchedulePush {
  faculty_wmsu_id: string;
  term_id: string;
  version_number: number;
  entries: Array<{
    subject_code: string;
    section: string;
    room_number: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
    load_type: 'lecture' | 'laboratory';
    contact_hours: number;
  }>;
}