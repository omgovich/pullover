import { visualCase } from '../test/visual'
import EmptyState from './EmptyState'

visualCase('inbox-zero', <EmptyState isError={false} />)
visualCase('refresh-failed', <EmptyState isError={true} />)
visualCase('partial-inbox', <EmptyState isError={false} isPartial />)
