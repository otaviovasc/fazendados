import { useMemo, useRef, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  calendarGrid,
  formatMonth,
  startOfMonth,
  today,
} from "../../lib/dates";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const SWIPE_THRESHOLD = 48;

/** Conteúdo de uma célula do calendário: valor exibido e calor (0 a 1). */
export interface DayContent {
  label?: string;
  heat?: number;
}

export function MonthCalendar({
  month,
  onMonthChange,
  dayContent,
  onDayPress,
  selectedDate,
  dayAriaLabel,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  /** Valor e intensidade de cada dia; dias sem conteúdo aparecem vazios. */
  dayContent: (date: string) => DayContent | null;
  onDayPress: (date: string) => void;
  selectedDate?: string;
  dayAriaLabel: (date: string, content: DayContent | null) => string;
}) {
  const touchStartX = useRef<number | null>(null);
  const currentMonth = startOfMonth(today());
  const cells = useMemo(() => calendarGrid(month), [month]);

  function changeMonth(delta: number) {
    const next = addMonths(month, delta);
    if (next <= currentMonth) onMonthChange(next);
  }

  function onTouchStart(ev: TouchEvent) {
    touchStartX.current = ev.touches[0].clientX;
  }

  function onTouchEnd(ev: TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = ev.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    changeMonth(delta > 0 ? -1 : 1);
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-center justify-between px-4 pt-3 md:px-5">
        <button
          onClick={() => changeMonth(-1)}
          aria-label="Mês anterior"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -ml-2 text-ink-soft hover:text-ink"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="font-semibold capitalize select-none">{formatMonth(month)}</p>
        <button
          onClick={() => changeMonth(1)}
          disabled={month === currentMonth}
          aria-label="Próximo mês"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 text-ink-soft hover:text-ink disabled:opacity-30 disabled:hover:text-ink-soft"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-7 px-2 pb-3 md:px-3">
        {WEEKDAYS.map((wd) => (
          <p
            key={wd}
            className="text-center text-[11px] font-medium text-ink-faint uppercase pt-1 pb-2"
          >
            {wd}
          </p>
        ))}

        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />;
          const content = dayContent(date);
          const isToday = date === today();
          const isFuture = date > today();
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              onClick={() => onDayPress(date)}
              disabled={isFuture}
              aria-label={dayAriaLabel(date, content)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl transition-colors ${
                isFuture
                  ? "opacity-30 cursor-default"
                  : "hover:bg-black/5 active:bg-black/10"
              } ${
                isSelected
                  ? "ring-2 ring-inset ring-pasture-600"
                  : isToday
                    ? "ring-1 ring-inset ring-pasture-600/50"
                    : ""
              }`}
              style={
                content?.heat
                  ? { backgroundColor: `rgba(47,82,51,${content.heat})` }
                  : undefined
              }
            >
              <span
                className={`text-sm leading-none ${
                  isToday ? "font-bold text-pasture-700" : "font-medium"
                }`}
              >
                {Number(date.slice(8))}
              </span>
              {content?.label ? (
                <span className="tnum text-[11px] leading-none font-semibold text-pasture-700">
                  {content.label}
                </span>
              ) : (
                !isFuture && (
                  <span className="text-[11px] leading-none text-ink-faint">·</span>
                )
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
