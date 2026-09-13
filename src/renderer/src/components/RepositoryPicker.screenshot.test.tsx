import { visualCase } from '../test/visual'
import RepositoryPicker from './RepositoryPicker'

/**
 * The picker reaches for the IPC bridge only from its handlers, so it renders
 * on plain props. Whether every repository is watched is the pane's business,
 * not its own: it is simply not rendered in that case.
 */

const FEW = ['acme/web', 'acme/api', 'acme/infra']

const MANY = [
  'acme/web',
  'acme/api',
  'acme/infra',
  'acme/design-system',
  'acme/mobile',
  'acme/platform-terraform-modules',
]

visualCase('nothing-fetched', <RepositoryPicker knownRepositories={[]} selected={[]} />)

visualCase('few-repositories', <RepositoryPicker knownRepositories={FEW} selected={['acme/api']} />)

visualCase(
  'filter-shown',
  <RepositoryPicker knownRepositories={MANY} selected={['acme/api', 'acme/web']} />,
)
