import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventsModule from './EventsModule';
import { SchoolEvent, Student } from '../types';

const mockEvents: SchoolEvent[] = [
  {
    id: 'evt_1',
    name: 'School Trip to Museum',
    description: 'Educational trip',
    category: 'trip',
    date: '2026-10-01',
    location: 'Tunis Museum',
    priceStudent: 10,
    priceParent: 20,
    priceSibling: 15,
    priceExternal: 25,
    maxCapacity: 50,
    busIncluded: true,
    status: 'confirmed',
    schoolYear: '2025-2026',
    participants: [
      {
        id: 'prt_1',
        participantName: 'Ahmed Test',
        participantType: 'student',
        contactPhone: '12345678',
        amountPaid: 10,
        totalRequired: 20,
        remainingBalance: 10,
        paid: false,
        attended: false,
        receiptNumber: 'REC-EVT-001',
      }
    ],
    createdAt: new Date().toISOString(),
  }
];

const mockStudents: Student[] = [
  {
    id: 'std_1',
    firstName: 'Ahmed',
    lastName: 'Test',
    father: {
      phoneMobile: '12345678',
    },
  } as unknown as Student,
];

describe('EventsModule', () => {
  const defaultProps = {
    events: mockEvents,
    onUpdateEvents: vi.fn(),
    students: mockStudents,
    settings: { schoolYear: '2025-2026' } as any,
    sidebarCollapsed: false,
  };

  it('renders event list and allows selecting an event', () => {
    render(<EventsModule {...defaultProps} />);

    expect(screen.getByText('School Trip to Museum')).toBeInTheDocument();

    const eventButtons = screen.getAllByText('School Trip to Museum');
    fireEvent.click(eventButtons[0]);

    expect(screen.getAllByText('Tunis Museum')[0]).toBeInTheDocument();
  });

  it('can create a new event', () => {
    render(<EventsModule {...defaultProps} />);

    fireEvent.click(screen.getByText('فعالية جديدة'));

    fireEvent.change(screen.getByLabelText(/اسم الفعالية/), { target: { value: 'New Event' } });
    fireEvent.change(screen.getByLabelText(/الموقع/), { target: { value: 'New Location' } });
    fireEvent.change(screen.getByLabelText(/التاريخ/), { target: { value: '2026-12-01' } });

    fireEvent.click(screen.getByText('حفظ الفعالية'));

    expect(defaultProps.onUpdateEvents).toHaveBeenCalled();
  });

  it('can add a participant to a selected event', () => {
    render(<EventsModule {...defaultProps} />);

    fireEvent.click(screen.getByText('School Trip to Museum'));
    fireEvent.click(screen.getByText('إضافة مشارك'));

    fireEvent.change(screen.getByLabelText(/اسم المشارك/), { target: { value: 'Sami Test' } });

    fireEvent.click(screen.getByText('حفظ المشارك'));

    expect(defaultProps.onUpdateEvents).toHaveBeenCalled();
  });

  it('can record a payment for a participant', () => {
    render(<EventsModule {...defaultProps} />);

    fireEvent.click(screen.getByText('School Trip to Museum'));

    const paymentBtns = screen.getAllByTitle('تسجيل دفعة');
    fireEvent.click(paymentBtns[0]);

    fireEvent.change(screen.getByLabelText(/المبلغ/), { target: { value: '5' } });
    fireEvent.click(screen.getByText('تسجيل الدفعة'));

    expect(defaultProps.onUpdateEvents).toHaveBeenCalled();
  });

  it('toggles attendance for a participant', () => {
    render(<EventsModule {...defaultProps} />);

    fireEvent.click(screen.getByText('School Trip to Museum'));

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(defaultProps.onUpdateEvents).toHaveBeenCalled();
  });
});
