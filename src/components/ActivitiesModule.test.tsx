import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ActivitiesModule from './ActivitiesModule';
import { Activity } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const activity: Activity = {
  id: 'act_1',
  title: 'Atelier peinture',
  category: 'art',
  weekday: 2, // Mercredi
  timeStart: '10:00',
  timeEnd: '11:00',
  location: 'Salle A',
  levelClass: 'Petite section'
};

const DAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('ActivitiesModule', () => {
  it('places an activity chip in the correct day column', () => {
    render(<ActivitiesModule activities={[activity]} onUpdateActivities={vi.fn()} />);
    expect(screen.getByText('Atelier peinture')).toBeTruthy();
    // Wednesday = weekday 2: its band cells carry data-day-column="2"
    const wedCells = Array.from(document.querySelectorAll('[data-day-column="2"]')) as HTMLElement[];
    expect(wedCells.length).toBeGreaterThan(0);
    expect(wedCells.some(c => c.textContent?.includes('Atelier peinture'))).toBe(true);
  });

  it('maps the four categories to distinct color classes', () => {
    const acts: Activity[] = [
      { ...activity, id: 'a1', category: 'motricite', title: 'M' },
      { ...activity, id: 'a2', category: 'art', title: 'A' },
      { ...activity, id: 'a3', category: 'musique', title: 'Mu' },
      { ...activity, id: 'a4', category: 'jeu', title: 'J' }
    ];
    render(<ActivitiesModule activities={acts} onUpdateActivities={vi.fn()} />);
    // 004 data-model palette: motricite=emerald, art=violet, musique=amber, jeu=sky
    for (const [title, cls] of [['M', 'bg-emerald'], ['A', 'bg-violet'], ['Mu', 'bg-amber'], ['J', 'bg-sky']] as const) {
      const chip = screen.getByText(title).closest('[data-category]') as HTMLElement;
      expect(chip.getAttribute('data-category'), `class for ${title}`).toBe(cls);
    }
  });

  it('regroups activities when the grouping toggle changes', () => {
    const acts: Activity[] = [
      { ...activity, id: 'a1', levelClass: 'PS', location: 'Salle A' },
      { ...activity, id: 'a2', levelClass: 'PS', location: 'Salle B' }
    ];
    render(<ActivitiesModule activities={acts} onUpdateActivities={vi.fn()} />);
    // by class: both in one group "PS"
    expect(screen.getAllByText('PS').length).toBeGreaterThan(0);
    // switch to location grouping
    fireEvent.click(screen.getByRole('button', { name: /المكان|Salle/i }));
    expect(screen.getByText('Salle A')).toBeTruthy();
    expect(screen.getByText('Salle B')).toBeTruthy();
  });

  it('blocks invalid submissions (no title) without calling the setter', () => {
    const onUpdateActivities = vi.fn();
    render(<ActivitiesModule activities={[]} onUpdateActivities={onUpdateActivities} />);
    fireEvent.click(screen.getByRole('button', { name: /نشاط جديد|إضافة/ }));
    // leave title empty, submit
    fireEvent.submit(document.querySelector('form')!);
    expect(onUpdateActivities).not.toHaveBeenCalled();
  });

  it('adds a valid activity through the dialog', () => {
    const onUpdateActivities = vi.fn();
    render(<ActivitiesModule activities={[]} onUpdateActivities={onUpdateActivities} />);
    fireEvent.click(screen.getByRole('button', { name: /نشاط جديد|إضافة/ }));
    fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: 'Musique douce' } });
    fireEvent.change(screen.getByLabelText(/الفئة/), { target: { value: 'musique' } });
    fireEvent.change(screen.getByLabelText(/اليوم/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/من/), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText(/إلى/), { target: { value: '10:00' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(onUpdateActivities).toHaveBeenCalledTimes(1);
    const saved = onUpdateActivities.mock.calls[0][0][0];
    expect(saved.title).toBe('Musique douce');
    expect(saved.category).toBe('musique');
    expect(saved.weekday).toBe(1);
    expect(saved.timeStart).toBe('09:00');
    expect(saved.timeEnd).toBe('10:00');
  });

  // ── 004 T010: band placement ─────────────────────────────────────────

  it('places the chip inside the 10:00 band cell of its day column', () => {
    render(<ActivitiesModule activities={[activity]} onUpdateActivities={vi.fn()} />);
    const bandCell = screen.getByText('Atelier peinture').closest('[data-band="10:00"]') as HTMLElement;
    expect(bandCell).toBeTruthy();
    expect(bandCell.closest('[data-day-column]')?.getAttribute('data-day-column')).toBe('2');
  });

  it('renders two activities sharing a day/band cell (overlap tolerance)', () => {
    const acts: Activity[] = [
      { ...activity, id: 'a1', title: 'Un' },
      { ...activity, id: 'a2', title: 'Deux' }
    ];
    render(<ActivitiesModule activities={acts} onUpdateActivities={vi.fn()} />);
    const bandCell = screen.getByText('Un').closest('[data-band="10:00"]') as HTMLElement;
    expect(bandCell.textContent).toContain('Deux');
  });

  // ── 004 T014: drag move + tap fallback + grouping non-mutation ──────

  it('moves a chip via dragstart/drop to another day and invokes the save callback', () => {
    const onUpdateActivities = vi.fn();
    render(<ActivitiesModule activities={[activity]} onUpdateActivities={onUpdateActivities} />);
    const chip = screen.getByText('Atelier peinture').closest('[draggable]') as HTMLElement;
    fireEvent.dragStart(chip, { dataTransfer: { setData: vi.fn() } });
    const target = document.querySelector('[data-day-column="3"]') as HTMLElement; // Thursday band cell
    expect(target).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: { getData: () => 'act_1' } });
    expect(onUpdateActivities).toHaveBeenCalledTimes(1);
    const moved = onUpdateActivities.mock.calls[0][0].find((a: Activity) => a.id === 'act_1');
    expect(moved.weekday).toBe(3);
    expect(moved.timeStart).toBe('10:00'); // band-snapped start, duration kept
    expect(moved.timeEnd).toBe('11:00');
  });

  it('moves a chip via tap-select then tapping a target cell (touch fallback)', () => {
    const onUpdateActivities = vi.fn();
    render(<ActivitiesModule activities={[activity]} onUpdateActivities={onUpdateActivities} />);
    const chip = screen.getByText('Atelier peinture').closest('[draggable]') as HTMLElement;
    fireEvent.click(chip); // select
    const target = document.querySelector('[data-day-column="4"]') as HTMLElement; // Friday band cell
    expect(target).toBeTruthy();
    fireEvent.click(target);
    expect(onUpdateActivities).toHaveBeenCalledTimes(1);
    const moved = onUpdateActivities.mock.calls[0][0].find((a: Activity) => a.id === 'act_1');
    expect(moved.weekday).toBe(4);
  });

  it('grouping toggle re-chunks the view without calling the save callback', () => {
    const onUpdateActivities = vi.fn();
    const acts: Activity[] = [
      { ...activity, id: 'a1', levelClass: 'PS', location: 'Salle A' },
      { ...activity, id: 'a2', levelClass: 'GS', location: 'Salle B' },
      { ...activity, id: 'a3', levelClass: undefined, location: undefined } // unassigned
    ];
    render(<ActivitiesModule activities={acts} onUpdateActivities={onUpdateActivities} />);
    fireEvent.click(screen.getByRole('button', { name: /حسب الفئة/ }));
    // group sections render, unassigned last
    const sections = screen.getAllByText(/بدون تصنيف/);
    expect(sections.length).toBeGreaterThan(0);
    expect(onUpdateActivities).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /حسب المكان/ }));
    expect(onUpdateActivities).not.toHaveBeenCalled();
  });

  it('supports date-mode activities rendered under their own dated header', () => {
    const dated: Activity = { ...activity, id: 'd1', weekday: undefined, date: '2026-10-15' };
    render(<ActivitiesModule activities={[dated]} onUpdateActivities={vi.fn()} />);
    expect(screen.getByText('Atelier peinture')).toBeTruthy();
    expect(screen.getAllByText('2026-10-15').length).toBeGreaterThan(0);
  });
});
