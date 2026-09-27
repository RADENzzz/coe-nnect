import Icon from '../ui/Icon';

export default function TopBar() {
  return (
    <header className="hidden md:flex justify-between items-center px-6 w-full h-16 sticky top-0 z-40 bg-surface-bright border-b border-surface-variant">
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold text-primary">Lumina Schedule</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden lg:block">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="text"
            placeholder="Search..."
            className="pl-10 pr-4 py-2 bg-surface-container-low border border-surface-variant rounded-full text-sm focus:outline-none focus:border-secondary-container focus:ring-1 focus:ring-secondary-container transition-all"
          />
        </div>

        <button className="w-10 h-10 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center text-on-surface-variant">
          <Icon name="notifications" />
        </button>

        <button className="w-10 h-10 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center text-on-surface-variant">
          <Icon name="settings" />
        </button>

        <div className="w-10 h-10 rounded-full bg-surface-container-highest overflow-hidden border border-surface-variant cursor-pointer flex items-center justify-center text-primary font-bold">
          A
        </div>
      </div>
    </header>
  );
}