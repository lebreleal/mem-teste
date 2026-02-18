import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const RichEditor = lazy(() => import('@/components/RichEditor'));

type RichEditorProps = React.ComponentProps<typeof RichEditor>;

const LazyRichEditor = (props: RichEditorProps) => (
  <Suspense fallback={<Skeleton className="h-[120px] w-full rounded-lg" />}>
    <RichEditor {...props} />
  </Suspense>
);

export default LazyRichEditor;
