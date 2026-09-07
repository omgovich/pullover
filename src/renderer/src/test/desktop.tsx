import { BatteryFull, GitPullRequest, Search, SlidersHorizontal, Wifi } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'
import type { ColorMode } from '../useColorMode'

/**
 * The desktop a documentation screenshot is staged on: a menu bar with
 * Pullover's own item lit up, and the popup hanging below it with the drop
 * shadow macOS gives it.
 *
 * Drawn rather than photographed, so a screenshot needs no wallpaper file, no
 * real menu bar and no particular Mac — and so the clock reads the same in
 * every run. Nothing here is app UI; the colours below are macOS's, which is
 * why they are literals instead of Reshaped tokens. The type sizes still come
 * from `Text`.
 *
 * The popup is centred in the frame rather than under the menu-bar item it
 * belongs to: the two can't both be true in a crop this narrow, and a
 * lopsided composition is the more noticeable lie.
 */

/** `CARD_WIDTH` and `CARD_HEIGHT` in src/main/window.ts. */
const POPUP_WIDTH_PX = 440
const POPUP_HEIGHT_PX = 620

const MENU_BAR_HEIGHT_PX = 26
const SIDE_MARGIN_PX = 132
const POPUP_TOP_GAP_PX = 20
const BOTTOM_MARGIN_PX = 56

const FRAME_WIDTH_PX = POPUP_WIDTH_PX + 2 * SIDE_MARGIN_PX

const WALLPAPER: Record<ColorMode, string> = {
  light: 'linear-gradient(155deg, #eceff6 0%, #e7e3f0 48%, #f6eef1 100%)',
  // Well clear of the popup's own near-black, so both the translucent menu
  // bar and the window's edge read as something sitting on a desktop rather
  // than as one dark field with shapes cut out of it.
  dark: 'linear-gradient(155deg, #333a52 0%, #3f3a58 48%, #52405c 100%)',
}

const MENU_BAR_BACKGROUND: Record<ColorMode, string> = {
  light: 'rgba(255, 255, 255, 0.7)',
  dark: 'rgba(18, 18, 24, 0.55)',
}

/** The wash macOS puts behind a menu-bar item whose window is open. */
const ITEM_HIGHLIGHT: Record<ColorMode, string> = {
  light: 'rgba(0, 0, 0, 0.08)',
  dark: 'rgba(255, 255, 255, 0.16)',
}

const POPUP_SHADOW: Record<ColorMode, string> = {
  light: '0 22px 56px rgba(16, 18, 40, 0.2), 0 3px 10px rgba(16, 18, 40, 0.1)',
  dark: '0 22px 56px rgba(0, 0, 0, 0.55), 0 3px 10px rgba(0, 0, 0, 0.4)',
}

/** Frozen, and late enough in the evening to explain the size of the inbox. */
const CLOCK = 'Mon 22:40'

interface Props {
  mode: ColorMode
  /** Pull requests waiting on the user, as the tray item spells it out. */
  count: number
  children: React.ReactNode
}

function StatusIcon({ svg }: { svg: React.ComponentType }): React.JSX.Element {
  return <Icon svg={svg} size="15px" color="neutral" />
}

export default function DesktopFrame({ mode, count, children }: Props): React.JSX.Element {
  return (
    <div
      data-testid="desktop"
      style={{ width: `${FRAME_WIDTH_PX}px`, background: WALLPAPER[mode] }}
    >
      <View
        direction="row"
        align="center"
        justify="end"
        gap={3}
        height={`${MENU_BAR_HEIGHT_PX}px`}
        paddingInline={3}
        attributes={{
          style: {
            background: MENU_BAR_BACKGROUND[mode],
            backdropFilter: 'blur(20px)',
          },
        }}
      >
        <View
          direction="row"
          align="center"
          gap={1.5}
          height="20px"
          paddingInline={1.5}
          borderRadius="small"
          attributes={{ style: { background: ITEM_HIGHLIGHT[mode] } }}
        >
          {/* The glyph src/main/tray-icon.ts rasterises, at source. */}
          <Icon svg={GitPullRequest} size="14px" color="neutral" />
          {/* `formatBadgeTitle` in src/main/tray.ts, whose module can't be
              imported here — it pulls in electron. */}
          <Text as="span" variant="caption-1" color="neutral" numeric>
            {count} PRs
          </Text>
        </View>

        <StatusIcon svg={BatteryFull} />
        <StatusIcon svg={Wifi} />
        <StatusIcon svg={Search} />
        <StatusIcon svg={SlidersHorizontal} />

        <Text as="span" variant="caption-1" color="neutral" numeric>
          {CLOCK}
        </Text>
      </View>

      <View align="center" paddingTop={POPUP_TOP_GAP_PX / 4} paddingBottom={BOTTOM_MARGIN_PX / 4}>
        <div
          style={{
            width: `${POPUP_WIDTH_PX}px`,
            height: `${POPUP_HEIGHT_PX}px`,
            // The app draws its own rounded border; this only has to clip to
            // the same curve and cast the shadow the real window gets free.
            borderRadius: 'var(--rs-radius-large)',
            overflow: 'hidden',
            boxShadow: POPUP_SHADOW[mode],
          }}
        >
          {children}
        </div>
      </View>
    </div>
  )
}
