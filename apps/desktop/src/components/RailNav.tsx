/**
 * Fixed-width left gutter matching `.rail` geometry so `main-shell-stage` aligns with
 * `WindowTitleBar` / `AppStatusBar` leading columns. No interactive controls.
 */
export function RailNav() {
  return (
    <div className="rail" aria-hidden>
      <div className="rail-spacer" />
    </div>
  );
}
