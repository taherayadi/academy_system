import React, { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * Self-contained close-confirmation dialog.
 * Listens for the Electron main-process close request and shows a themed
 * confirmation dialog. Render it once at the top of the app so it works on
 * every screen, including the login page.
 */
export default function CloseConfirmDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const api = window.appAPI;
    if (!api) return;
    return api.onCloseRequest(() => setOpen(true));
  }, []);

  return (
    <ConfirmDialog
      open={open}
      title="تأكيد الإغلاق"
      danger={false}
      confirmLabel="إغلاق"
      cancelLabel="إلغاء"
      message={
        <span>
          هل تريد إغلاق التطبيق؟
          <br />
          <span className="text-slate-400 text-xs">سيتم إيقاف الخادم وإغلاق جميع البيانات.</span>
        </span>
      }
      onConfirm={() => {
        setOpen(false);
        window.appAPI?.confirmClose();
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
