import { AnimatePresence } from 'motion/react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { deleteAdvertisementApi } from '../api';
import RenewalReviewModal from './RenewalReviewModal';
import ConfirmDialog from './ConfirmDialog';
import icon from '../assets/icon.png';
import { titleCaseName } from './dashboard/constants';
import type { PlatformAdminDashboardProps } from './dashboard/constants';
import { usePlatformDashboard } from './dashboard/usePlatformDashboard';
import NewCenterModal from './dashboard/NewCenterModal';
import EditInvoiceModal from './dashboard/EditInvoiceModal';
import EditCenterModal from './dashboard/EditCenterModal';
import PlanManagerModal from './dashboard/PlanManagerModal';
import AdvertisementFormModal from './dashboard/AdvertisementFormModal';
import OverviewSection from './dashboard/OverviewSection';
import CentersSection from './dashboard/CentersSection';
import RequestsSection from './dashboard/RequestsSection';
import FinanceSection from './dashboard/FinanceSection';
import PricingSection from './dashboard/PricingSection';
import AdvertisementsSection from './dashboard/AdvertisementsSection';
import RenewalsSection from './dashboard/RenewalsSection';
import type { DashboardApi } from './dashboard/usePlatformDashboard';

export default function PlatformAdminDashboard({ page = 'overview', onNavigate }: PlatformAdminDashboardProps) {
  const d: DashboardApi = usePlatformDashboard({ page, onNavigate });
  const { PAGE_META, search, setSearch, load, loading, setShowNewCenter, showNewCenter, convertRequest, setConvertRequest, editCenter, setEditCenter, planCenter, setPlanCenter, reviewRenewal, setReviewRenewal, onRenewalDecided, editInvoice, setEditInvoice, loadFinanceData, handlePrintInvoice, showNewAd, editAd, centers, setShowNewAd, setEditAd, loadAdvertisements, deleteCenter, handleDeleteCenter, setDeleteCenter, deleteRequest, handleDeleteRequest, setDeleteRequest, deleteAd, toast, setDeleteAd } = d;
  return (
    <div className="relative space-y-6" dir="rtl">

      {/* soft wash — same spirit as the landing page */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 h-[280px] w-[760px] rounded-full bg-accent-500/[0.06] blur-[110px] pointer-events-none" />

      {/* ─── Header (landing style card) ──────────────────────────── */}
      <div className="relative flex items-center justify-between flex-wrap gap-4 rounded-3xl bg-white border border-slate-200 shadow-sm shadow-slate-900/5 px-5 py-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-accent-500 shadow-sm shadow-accent-500/20 flex items-center justify-center flex-shrink-0">
            <img src={icon} alt="SaaS" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{PAGE_META[page].title}</h1>
            <p className="text-xs text-slate-500 font-bold">{PAGE_META[page].sub}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(page === 'centers' || page === 'requests') && (
            <div className="relative">
              <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={page === 'centers' ? 'ابحث عن مركز…' : 'ابحث عن طلب…'}
                className="w-48 sm:w-56 ps-9 pe-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:border-accent-500 focus:ring-0 outline-none transition"
              />
            </div>
          )}
          <button onClick={load} className="p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:border-accent-500/40 hover:text-accent-500 text-slate-600 transition cursor-pointer" title="تحديث" aria-label="تحديث">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowNewCenter(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-500 hover:shadow-md text-white text-sm font-black rounded-xl shadow-sm shadow-accent-500/20 transition cursor-pointer">
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">مركز جديد</span>
            <span className="sm:hidden">Centre</span>
          </button>
        </div>
      </div>

      {/* ═══ OVERVIEW PAGE ═══ */}
      {page === 'overview' && (
        <OverviewSection d={d} />
      )}

      {/* ═══ CENTERS PAGE ═══ */}
      {page === 'centers' && (
        <CentersSection d={d} />
      )}

      {/* ═══ REQUESTS PAGE ═══ */}
      {page === 'requests' && (
        <RequestsSection d={d} />
      )}

      {/* ═══ FINANCE PAGE ═══ */}
      {page === 'finance' && (
        <FinanceSection d={d} />
      )}

      {/* ═══ PRICING PAGE (Tarifs & Modules) ═══ */}
      {page === 'pricing' && (
        <PricingSection d={d} />
      )}

      {/* ─── Advertisements Page ───────────────────────────────────────── */}
      {page === 'advertisements' && (
        <AdvertisementsSection d={d} />
      )}

      {/* ─── Renewal Requests Page ───────────────────────────────────────── */}
      {page === 'renewals' && (
        <RenewalsSection d={d} />
      )}

      {/* ─── Modals ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewCenter && (
          <NewCenterModal
            initialData={convertRequest || undefined}
            convertRequestId={convertRequest?.id}
            onClose={() => { setShowNewCenter(false); setConvertRequest(null); }}
            onCreated={load}
          />
        )}
        {editCenter && (
          <EditCenterModal
            center={editCenter}
            onClose={() => setEditCenter(null)}
            onSaved={load}
          />
        )}
        {planCenter && (
          <PlanManagerModal
            center={planCenter}
            onClose={() => setPlanCenter(null)}
            onSaved={load}
          />
        )}
        {reviewRenewal && (
          <RenewalReviewModal
            request={reviewRenewal}
            onClose={() => setReviewRenewal(null)}
            onDecided={onRenewalDecided}
          />
        )}
        {editInvoice && (
          <EditInvoiceModal
            invoice={editInvoice}
            onClose={() => setEditInvoice(null)}
            onSaved={loadFinanceData}
            onPrint={handlePrintInvoice}
          />
        )}
        {(showNewAd || editAd) && (
          <AdvertisementFormModal
            ad={editAd}
            centers={centers}
            onClose={() => { setShowNewAd(false); setEditAd(null); }}
            onSaved={loadAdvertisements}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!deleteCenter}
        title="حذف المركز؟"
        message={`هل أنت متأكد من حذف «${deleteCenter?.name}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={handleDeleteCenter}
        onCancel={() => setDeleteCenter(null)}
      />
      <ConfirmDialog
        open={!!deleteRequest}
        title="حذف الطلب؟"
        message={`حذف طلب «${titleCaseName(deleteRequest?.fullName)}»؟`}
        onConfirm={handleDeleteRequest}
        onCancel={() => setDeleteRequest(null)}
      />
      <ConfirmDialog
        open={!!deleteAd}
        title="حذف هذا الإعلان؟"
        message={`حذف «${deleteAd?.title}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={async () => {
          if (!deleteAd) return;
          try {
            await deleteAdvertisementApi(deleteAd.id);
            toast.success('تم حذف الإعلان');
            setDeleteAd(null);
            loadAdvertisements();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'خطأ أثناء الحذف');
          }
        }}
        onCancel={() => setDeleteAd(null)}
      />
    </div>
  );
}
