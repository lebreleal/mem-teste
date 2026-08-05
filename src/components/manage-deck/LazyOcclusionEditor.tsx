import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const OcclusionEditor = lazy(() => import('@/components/manage-deck/OcclusionEditor'));

type OcclusionEditorProps = React.ComponentProps<typeof OcclusionEditor>;

const LazyOcclusionEditor = (props: OcclusionEditorProps) => (
  <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-lg" />}>
    <OcclusionEditor {...props} />
  </Suspense>
);

export default LazyOcclusionEditor;
