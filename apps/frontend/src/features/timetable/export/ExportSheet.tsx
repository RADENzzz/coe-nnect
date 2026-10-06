import BottomSheet from '../../../components/ui/BottomSheet';
import Icon from '../../../components/ui/Icon';

export type ExportFormat = 'agenda' | 'grid' | 'table';
export type ExportBusy = 'pdf' | 'excel' | 'print' | 'share' | null;

interface Props {
  open: boolean;
  onClose: () => void;
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  /** Formats the toggle should offer. */
  availableFormats: ExportFormat[];
  /** Scope label, e.g. "Master View · 42 entries". */
  scopeLine: string;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onShare: () => void;
  canShare: boolean;
  busy: ExportBusy;
  disabled: boolean;
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  agenda: 'Agenda',
  grid: 'Grid',
  table: 'Table',
};

const FORMAT_ICON: Record<ExportFormat, string> = {
  agenda: 'view_list',
  grid: 'grid_on',
  table: 'table_view',
};

export default function ExportSheet({
  open,
  onClose,
  format,
  onFormatChange,
  availableFormats,
  scopeLine,
  onExportPdf,
  onExportExcel,
  onShare,
  canShare,
  busy,
  disabled,
}: Props) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Export"
      description={scopeLine}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
        >
          Cancel
        </button>
      }
    >
      <div className="space-y-4">
        {/* Format toggle */}
        {availableFormats.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Format
            </p>
            <div className="grid grid-cols-3 gap-2">
              {availableFormats.map((f) => {
                const active = f === format;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onFormatChange(f)}
                    className={`flex flex-col items-center gap-1.5 py-3 border transition ${
                      active
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon name={FORMAT_ICON[f]} size={20} filled={active} />
                    <span className="text-xs font-semibold">
                      {FORMAT_LABEL[f]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Actions
          </p>

          <button
            type="button"
            onClick={onExportPdf}
            disabled={disabled}
            className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 hover:bg-slate-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon
              name={busy === 'pdf' ? 'hourglass_top' : 'picture_as_pdf'}
              size={20}
              className="text-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {busy === 'pdf' ? 'Generating…' : 'Export PDF'}
              </p>
              <p className="text-xs text-slate-500">
                Download as .pdf
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            disabled={disabled}
            className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 hover:bg-slate-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon
              name={busy === 'excel' ? 'hourglass_top' : 'table_view'}
              size={20}
              className="text-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {busy === 'excel' ? 'Generating…' : 'Export Excel'}
              </p>
              <p className="text-xs text-slate-500">
                Download as .xlsx
              </p>
            </div>
          </button>

          {canShare && (
            <button
              type="button"
              onClick={onShare}
              disabled={disabled}
              className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 hover:bg-slate-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon
                name={busy === 'share' ? 'hourglass_top' : 'ios_share'}
                size={20}
                className="text-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {busy === 'share' ? 'Preparing…' : 'Share'}
                </p>
                <p className="text-xs text-slate-500">
                  Save, print, or send to an app
                </p>
              </div>
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}