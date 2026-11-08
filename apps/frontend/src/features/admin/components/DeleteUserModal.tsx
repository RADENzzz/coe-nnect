import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import type { UserRecord } from './types';

interface Props {
  open: boolean;
  user: UserRecord | null;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}

export default function DeleteUserModal({ open, user, onClose, onConfirm }: Props) {
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
      setVerifying(false);
    }
  }, [open]);

  const submit = async () => {
    setVerifying(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Incorrect password');
      setVerifying(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm deletion"
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={verifying || !password}
            className="px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 bg-red-600 hover:bg-red-700 rounded-lg"
          >
            {verifying ? 'Verifying…' : 'Delete user'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
          <Icon name="warning" size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-900">This action cannot be undone.</p>
            <p className="text-red-700 text-xs mt-0.5">
              <strong>{user?.username}</strong> ({user?.email}) will be permanently removed.
            </p>
          </div>
        </div>
        {error && <div className="p-2 bg-red-100 text-red-700 text-xs rounded-lg">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            Confirm with your password
          </label>
          <input
            type="password"
            autoFocus
            placeholder="Your admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>
    </Modal>
  );
}