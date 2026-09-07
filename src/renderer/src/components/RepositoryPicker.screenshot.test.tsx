import { visualCase } from '../test/visual'
import RepositoryPicker from './RepositoryPicker'

/**
 * The picker reaches for the IPC bridge only from its handlers, so it renders
 * on plain props. Its one branch worth a picture is `FILTER_THRESHOLD`: under
 * five repositories the list is short enough to scan and the filter field is
 * left out, from five it appears.
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

visualCase('watching-all', <RepositoryPicker knownRepositories={FEW} selected={[]} watchAll />)

visualCase(
  'few-repositories',
  <RepositoryPicker knownRepositories={FEW} selected={['acme/api']} watchAll={false} />,
)

// Five or more, so the filter field is in.
visualCase(
  'filter-shown',
  <RepositoryPicker
    knownRepositories={MANY}
    selected={['acme/api', 'acme/web']}
    watchAll={false}
  />,
)
