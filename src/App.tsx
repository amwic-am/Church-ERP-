// The one router for one domain: the published site at `/`, the parish office at `/erp`.
//
// Three guards stand between a URL and a screen. `RequireAuth` will not mount the
// office shell without a session. `Guarded` demands the permission keys the sidebar
// entry declares, so a route cannot be reached by typing its address. `GuestOnly`
// sends a person who is already signed in back to the half of the platform they
// actually own. None of this is the security boundary — row level security in
// Postgres is — but a screen that shows data a person may not act on is a bug, so
// the router refuses to draw one.
import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '@/components/auth/AuthProvider';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/surface';
import { ForgotPasswordPage, LoginPage, NoAccessPage, ResetPasswordPage } from '@/erp/auth/pages';
import { screenFor } from '@/erp/screens';
import { ErpShell } from '@/erp/shell/ErpShell';
import { UI } from '@/lib/i18n';
import { ACCESS_DENIED_PATH, ERP_NAV, FORGOT_PATH, LOGIN_PATH, RESET_PATH, permsFor } from '@/lib/routes';
import { AlbumDetailPage, EventDetailPage, MezmurDetailPage, NewsDetailPage, PublicationDetailPage, SermonDetailPage } from '@/site/detail';
import { ContactPage, DonatePage, PrayerPage, RegisterPage, StatusPage } from '@/site/forms';
import { ClassesPage, CalendarPage, DepartmentsPage, HomePage, LeadershipPage, SundaySchoolPage } from '@/site/info';
import { AnyCmsPage, EventsPage, FaqPage, GalleryPage, MediaPage, MezmurPage, NewsPage, NotFoundPage, PublicationsPage, SearchPage, SermonsPage } from '@/site/lists';
import { CmsPage } from '@/site/CmsPage';
import { SiteShell } from '@/site/SiteShell';

function Pending() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30">
      <Spinner />
      <p className="text-sm text-muted-foreground">{UI.loading ?? 'በመጫን ላይ…'}</p>
    </div>
  );
}

/** Every ERP screen sits behind a live session. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status, identity } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Pending />;
  if (!identity) {
    const from = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${LOGIN_PATH}?from=${from}`} replace />;
  }
  return <>{children}</>;
}

/** The grants the sidebar entry declares — the same list the menu filter used. */
function Guarded({ path, children }: { path: string; children: ReactNode }) {
  const { can } = useAuth();
  const needed = permsFor(path);
  if (needed.length > 0 && !can(...needed)) {
    return (
      <EmptyState
        title="ፍቃድ አልተሰጠዎትም"
        description="ይህን ክፍል ለመክፈት የቤተ ክርስቲያኑ አስተዳደር ፍቃድ ያስፈልግዎታል። ከላይ ባለው ዝርዝር ውስጥ ከሚችሉት ክፍሎች ይምረጡ።"
      />
    );
  }
  return <>{children}</>;
}

/** Someone already signed in has no business looking at the sign-in form. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { status, identity, home } = useAuth();
  if (status === 'loading') return <Pending />;
  if (identity) return <Navigate to={home} replace />;
  return <>{children}</>;
}

/** The paths from `ERP_NAV`, turned into children of the `/erp` layout route. */
const erpItems = ERP_NAV.flatMap((group) => group.items).map((item) => ({
  path: item.path,
  childPath: item.path.replace(/^\/erp\//, ''),
  screen: screenFor(item.path),
}));

export function App() {
  const { status, notice } = useAuth();

  return (
    <Routes>
      <Route element={<SiteShell />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<CmsPage slug="about" fallbackTitle="ስለ ቤተ ክርስቲያናችን" fallbackBody="ቤተ ክርስቲያኑና ሰንበት ትምህርት ቤቱ እንዴት እንደተመሰረቱ፣ ዕላማና አገልግሎታቸው።" />} />
        <Route path="vision" element={<CmsPage slug="vision" fallbackTitle="ዕይታና ተልእኮ" fallbackBody="የሰንበት ትምህርት ቤቱ ዕይታ፣ ተልእኮና የሚከተላቸው መርሆዎች።" />} />
        <Route path="history" element={<CmsPage slug="history" fallbackTitle="ታሪካችን" fallbackBody="ከመሠረቱ እስከ ዛሬ የቤተ ክርስቲያኑና የትምህርት ቤቱ ታሪክ።" />} />
        <Route path="leadership" element={<LeadershipPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="sunday-school" element={<SundaySchoolPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="news/:slug" element={<NewsDetailPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:slug" element={<EventDetailPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="gallery/:slug" element={<AlbumDetailPage />} />
        <Route path="sermons" element={<SermonsPage />} />
        <Route path="sermons/:slug" element={<SermonDetailPage />} />
        <Route path="mezmur" element={<MezmurPage />} />
        <Route path="mezmur/:slug" element={<MezmurDetailPage />} />
        <Route path="publications" element={<PublicationsPage />} />
        <Route path="publications/:slug" element={<PublicationDetailPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="status" element={<StatusPage />} />
        <Route path="donate" element={<DonatePage />} />
        <Route path="prayer" element={<PrayerPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="page/:slug" element={<AnyCmsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path={LOGIN_PATH} element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path={FORGOT_PATH} element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
      <Route path={RESET_PATH} element={<ResetPasswordPage />} />
      <Route path={ACCESS_DENIED_PATH} element={<NoAccessPage />} />

      <Route
        path="/erp"
        element={
          <RequireAuth>
            {status === 'failed' && notice ? <ErrorNote className="m-4" message={notice} /> : null}
            <ErpShell />
          </RequireAuth>
        }
      >
        <Route index element={<ErpIndex />} />
        {erpItems.map((item) => (
          <Route key={item.path} path={item.childPath} element={<Guarded path={item.path}>{item.screen}</Guarded>} />
        ))}
        <Route
          path="*"
          element={
            <EmptyState
              title="ክፍሉ አልተገኘም"
              description="የጻፉት አድራሻ በአሠራሩ ውስጥ የለም።ዋናውን ገጽ ይክፈቱ ወይም በግራ ዝርዝር ውስጥ ይፈልጉ።"
            />
          }
        />
      </Route>
    </Routes>
  );
}

/** `/erp` itself has no content; each role belongs in a different place. */
function ErpIndex() {
  const { home, status } = useAuth();
  if (status === 'loading') return <Pending />;
  return <Navigate to={home} replace />;
}
