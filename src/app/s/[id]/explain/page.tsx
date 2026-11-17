import { ExplainClient } from '@/components/ExplainClient';
import { getReports, getTopics } from '@/lib/repo';

export default async function ExplainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topics = (await getTopics(id)).filter((t) => !t.parentId);
  const weakest = (await getReports(id)).at(-1)?.topics[0]?.topicId ?? '';
  return <ExplainClient subjectId={id} topics={topics.map((t) => ({ id: t.id, name: t.name }))} initialTopic={weakest} />;
}
