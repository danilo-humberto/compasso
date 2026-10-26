import { useId, useState } from "react";
import "./InfoTooltip.css";

export function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="info-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-tooltip-button"
        aria-label={`Sobre ${label}`}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.stopPropagation();
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <span id={id} role="tooltip" className="info-tooltip-content">
          {children}
        </span>
      )}
    </span>
  );
}
