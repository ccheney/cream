import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InfoIconProps {
  className?: string;
}

export function InfoIcon({ className }: InfoIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4M8 5.5v-.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface LabelWithTooltipProps {
  htmlFor: string;
  label: string;
  tooltip: string;
}

export function LabelWithTooltip({ htmlFor, label, tooltip }: LabelWithTooltipProps) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-stone-700 dark:text-night-100"
      >
        {label}
      </label>
      <Tooltip>
        <TooltipTrigger>
          <InfoIcon className="w-3.5 h-3.5 text-stone-400 dark:text-night-400 cursor-help" />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
