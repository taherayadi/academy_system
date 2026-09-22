import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, Loader2, Receipt, Printer } from 'lucide-react';
import { updateInvoiceApi, CenterInvoice } from '../../api';
import { useToast } from '../Toast';
import { FormField } from '../ui';

// ─── Edit Invoice Modal (statut / paiement / chèque) ────────────────────────
// `onPrint` reuses the Finance list's print path (src/utils/invoicePrint.ts):
// the printable copy always opens in its own window rather than being printed
// straight from this dialog (a `backdrop-blur` overlay + scaled modal print
// badly). The window's script-free markup, and the CSP reason for it, live
// with that module.
function EditInvoiceModal({ invoice, onClose, onSaved, onPrint }: {
  invoice: CenterInvoice;
  onClose: () => void;
  onSaved: () => void;
  onPrint?: (invoice: CenterInvoice) => void;
}) {
  const toast = useToast();
  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<CenterInvoice['status']>(invoice.status);
  const [method, setMethod] = useState<string>(
    invoice.paymentMethod === 'cash' || invoice.paymentMethod === 'cheque' ? invoice.paymentMethod : ''
  );
  const [chequeNumber, setChequeNumber] = useState(invoice.chequeNumber || '');
  const [chequeDate, setChequeDate] = useState(
    invoice.chequeDate ? new Date(invoice.chequeDate).toISOString().slice(0, 10) : ''
  );
  const [notes, setNotes] = useState(invoice.notes || '');

  const chequeMode = method === 'cheque';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'paid' && !method) {
      toast.error('اختر طريقة الدفع (نقدًا أو شيك).');
      return;
    }
    if (chequeMode && !chequeNumber.trim()) {
      toast.error('رقم الشيك إلزامي.');
      return;
    }
    if (chequeMode && !chequeDate) {
      toast.error('تاريخ الشيك إلزامي.');
      return;
    }
    setSaving(true);
    try {
      const chequeDateTs = chequeMode && chequeDate ? new Date(`${chequeDate}T12:00:00`).getTime() : null;
      await updateInvoiceApi(invoice.id, {
        status,
        paymentMethod: method || null,
        chequeNumber: chequeMode ? chequeNumber.trim() : null,
        chequeDate: chequeMode ? chequeDateTs : null,
        notes
      });
      toast.success('تم تحديث الفاتورة');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء التحديث.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div


        className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-accent-500/10 rounded-xl"><Receipt aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
            <h2 className="text-base font-black text-slate-900">فاتورة {invoice.invoiceNumber}</h2>
          </div>
          <div className="flex items-center gap-1">
            {onPrint && (
              <button type="button" onClick={() => onPrint(invoice)} title="طباعة الفاتورة" aria-label="طباعة الفاتورة"
                className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </button>
            )}
<button type="button" onClick={onClose} title="إغلاق" aria-label="إغلاق" className="p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <X className="h-5 w-5 text-slate-500" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 mb-4 text-xs font-bold text-slate-600">
          {invoice.centerName} · {invoice.amount.toFixed(2)} TND
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="الحالة" id="ei-status">
            <select id="ei-status" value={status} onChange={e => setStatus(e.target.value as CenterInvoice['status'])} className={`${inputCls} cursor-pointer`}>
              <option value="pending">قيد الانتظار</option>
              <option value="paid">مدفوعة</option>
              <option value="overdue">متأخرة</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </FormField>

          <FormField label="طريقة الدفع" id="ei-method">
            <select id="ei-method" value={method} onChange={e => setMethod(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">—</option>
              <option value="cash">نقدًا</option>
              <option value="cheque">شيك</option>
            </select>
          </FormField>

          {chequeMode && (
            <div className="rounded-2xl border border-accent-500/20 bg-accent-500/5 p-3.5 space-y-3">
              <p className="text-[11px] font-bold text-accent-700 leading-relaxed">
                شيك مستلم: اترك الحالة «قيد الانتظار» — تظهر الفاتورة في «شيكات قيد الانتظار» و
                لا <span className="underline">تُحتسب ضمن الإيرادات</span> حتى تتحصيلها
                (زر «تحصيل»، الذي يجعل الفاتورة «مدفوعة»).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="رقم الشيك" id="ei-cheque">
                  <input
                    id="ei-cheque"
                    type="text"
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="مثال: 001245"
                    dir="ltr"
                    className={`${inputCls} text-start`}
                  />
                </FormField>
                <FormField label="تاريخ الشيك" id="ei-cheque-date">
                  <input
                    id="ei-cheque-date"
                    type="date"
                    dir="ltr"
                    value={chequeDate}
                    onChange={e => setChequeDate(e.target.value)}
                    className={`${inputCls} cursor-pointer input-date-ltr text-start`}
                  />
                </FormField>
              </div>
            </div>
          )}

          <FormField label="ملاحظات" id="ei-notes">
            <textarea id="ei-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </FormField>

          <div className="flex items-center justify-between gap-3 pt-2">
            {onPrint ? (
              <button type="button" onClick={() => onPrint(invoice)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer"
>
                <Printer aria-hidden="true" className="h-4 w-4 text-slate-500" /> طباعة
              </button>
            ) : <span />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2.5 text-sm font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer">
                إلغاء
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-60">
                {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                Sauvegarder
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default EditInvoiceModal;
