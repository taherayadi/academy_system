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
    // chip appears inside the Wednesday column
    const wedColumn = screen.getByText('الأربعاء').closest('[data-day-column]') as HTMLElement;
    expect(wedColumn).toBeTruthy();
    expect(wedColumn.textContent).toContain('Atelier peinture');
  });

  it('maps the four categories to distinct color classes', () => {
    const acts: Activity[] = [
      { ...activity, id: 'a1', category: 'motricite', title: 'M' },
      { ...activity, id: 'a2', category: 'art', title: 'A' },
      { ...activity, id: 'a3', category: 'musique', title: 'Mu' },
      { ...activity, id: 'a4', category: 'jeu', title: 'J' }
    ];
    render(<ActivitiesModule activities={acts} onUpdateActivities={vi.fn()} />);
    for (const [title, cls] of [['M', 'bg-emerald'], ['A', 'bg-violet'], ['Mu', 'bg-sky'], ['J', 'bg-amber']] as const) {
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
});
