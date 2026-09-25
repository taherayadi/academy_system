import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudentRegistrationModule from './StudentRegistrationModule';
import { Student } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: (_t, prop) => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useSpring: (v: unknown) => v,
}));

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'st_1',
    firstName: 'Ahmed',
    lastName: 'Ben Ali',
    birthDate: '2015-05-10',
    birthPlace: 'Sfax',
    grade: 'Collège 7ème Année',
    mother: { name: 'M', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
    father: { name: 'F', birthDate: '', profession: '', address: '', phoneFixed: '', phoneMobile: '', email: '' },
    parentalSituation: 'mariés',
    siblings: [],
    authorizedPersons: [],
    allergies: '',
    academicHistory: {
      nMinus1: { school: '', grade: '' },
      nMinus2: { school: '', grade: '' },
      nMinus3: { school: '', grade: '' }
    },
    registration: { date: '2026-09-01', location: 'Sfax', signedElectronically: false },
    enrolledServices: { suivi: true, etude: false, library: false, meals: false },
    suiviFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    etudeFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    libraryFees: { annualRegistrationFee: 0, monthlyFee: 0 },
    mealSubscription: { mode: 'subscription', monthlyPrice: 0, unitPrice: 0, prepaidMeals: 0, consumedMealsCount: 0, active: false },
    payments: [],
    ...overrides
  };
}

function renderModule(props: Record<string, unknown> = {}) {
  return render(
    <StudentRegistrationModule
      students={[]}
      onAddStudent={vi.fn()}
      onUpdateStudent={vi.fn()}
      onDeleteStudent={vi.fn()}
      {...props}
    />
  );
}

async function openAddForm() {
  const addButtons = screen.getAllByRole('button').filter(b => (b.textContent || '').includes('تسجيل تلميذ جديد'));
  fireEvent.click(addButtons[0]);
  await screen.findByText(/1\. هويّة التلميذ/);
}

beforeEach(() => {
  localStorage.clear();
});

describe('StudentRegistrationModule type-aware fields', () => {
  it('hides school fields for a crèche and saves with empty grade', async () => {
    const onAddStudent = vi.fn();
    renderModule({ centerType: 'creche', onAddStudent });
    await openAddForm();

    expect(screen.queryByText(/المستوى الدراسي/)).toBeNull();
    expect(screen.queryByText(/المؤسسة التعليمية/)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('مثال: ياسين'), { target: { value: 'Yassine' } });
    fireEvent.change(screen.getByPlaceholderText('مثال: الطرابلسي'), { target: { value: 'Trabelsi' } });

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    expect(onAddStudent).toHaveBeenCalledTimes(1);
    expect(onAddStudent.mock.calls[0][0].grade).toBe('');
  });

  it('shows school fields for a formation center with grade required', async () => {
    renderModule({ centerType: 'formation' });
    await openAddForm();

    expect(screen.getByText(/المستوى الدراسي/)).toBeTruthy();
    expect(screen.getAllByText(/المؤسسة التعليمية/).length).toBeGreaterThan(0);
    const select = screen.getByDisplayValue('Lycée 1ère') as unknown as HTMLSelectElement;
    expect(select.required).toBe(true);
  });

  it('keeps school fields for legacy/undefined center type', async () => {
    renderModule({});
    await openAddForm();
    expect(screen.getByText(/المستوى الدراسي/)).toBeTruthy();
  });

  it('hides the grade badge in list cards and the grade filter for a crèche', async () => {
    renderModule({ centerType: 'creche', students: [makeStudent()] });
    // list view: form closed
    expect(screen.queryByText('Collège 7ème Année')).toBeNull();
    expect(screen.queryByText('كل المستويات')).toBeNull();
  });

  it('shows the grade badge in list cards for a formation center', () => {
    renderModule({ centerType: 'formation', students: [makeStudent()] });
    expect(screen.getAllByText('Collège 7ème Année').length).toBeGreaterThan(0);
    expect(screen.getByText('كل المستويات')).toBeTruthy();
  });
});

describe('StudentRegistrationModule remarks alignment — academic-history section (T019)', () => {
  it('omits the whole academic-history section for a crèche (print + form)', async () => {
    renderModule({ centerType: 'creche', students: [makeStudent()] });

    // Print view: the «4. المسار الدراسي (3 سنوات سابقة)» block is absent.
    fireEvent.click(screen.getByTitle('طباعة بطاقة التسجيل'));
    expect(screen.queryByText('4. المسار الدراسي (3 سنوات سابقة)')).toBeNull();
    fireEvent.click(screen.getByTitle('إغلاق المعاينة'));

    // Add form: SECTION 5 is the services block, not the cursus scolaire.
    await openAddForm();
    expect(screen.queryByText('5. المسار الدراسي لآخر 3 سنوات')).toBeNull();
    expect(screen.getByText(/5\. خدمات وموديولات السنتر/)).toBeTruthy();
  });

  it('keeps the academic-history section for a formation center (regression)', async () => {
    renderModule({ centerType: 'formation', students: [makeStudent()] });

    fireEvent.click(screen.getByTitle('طباعة بطاقة التسجيل'));
    expect(screen.getAllByText(/المسار الدراسي \(3 سنوات سابقة\)/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTitle('إغلاق المعاينة'));

    await openAddForm();
    expect(screen.getByText('5. المسار الدراسي لآخر 3 سنوات')).toBeTruthy();
  });

  it('strips academicHistory on submit for a crèche (fresh registration)', async () => {
    const onAddStudent = vi.fn();
    renderModule({ centerType: 'creche', onAddStudent });
    await openAddForm();

    fireEvent.change(screen.getByPlaceholderText('مثال: ياسين'), { target: { value: 'Yassine' } });
    fireEvent.change(screen.getByPlaceholderText('مثال: الطرابلسي'), { target: { value: 'Trabelsi' } });

    fireEvent.submit(document.querySelector('form')!);

    expect(onAddStudent).toHaveBeenCalledTimes(1);
    const saved = onAddStudent.mock.calls[0][0];
    expect(saved.grade).toBe('');
    expect(saved.academicHistory.nMinus1.school).toBe('');
    expect(saved.academicHistory.nMinus1.grade).toBe('');
  });

  it('keeps stored academicHistory verbatim when editing under a crèche (FR-010)', async () => {
    const onUpdateStudent = vi.fn();
    const st = makeStudent({
      academicHistory: {
        nMinus1: { school: 'École A', grade: 'GS' },
        nMinus2: { school: 'École B', grade: 'MS' },
        nMinus3: { school: '', grade: '' }
      }
    });
    renderModule({ centerType: 'creche', students: [st], onUpdateStudent });

    fireEvent.click(screen.getByTitle('تعديل الفيش'));
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(onUpdateStudent).toHaveBeenCalled());
    const saved = onUpdateStudent.mock.calls[0][0];
    expect(saved.academicHistory.nMinus1.school).toBe('École A');
    expect(saved.academicHistory.nMinus2.grade).toBe('MS');
  });
});
