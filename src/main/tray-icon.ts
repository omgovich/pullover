import { type NativeImage, nativeImage } from 'electron'

/**
 * The menu-bar glyph: lucide's `git-pull-request`, drawn by
 * `scripts/make-tray-icon.py` and pasted here as data URLs.
 *
 * Embedded rather than shipped as files because a menu-bar glyph is a few
 * hundred bytes, and a path would have to resolve differently in development
 * and inside the packaged asar — this cannot go missing. Rerun the script
 * and replace both strings to change the shape.
 */
const ICON_1X =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABCElEQVR42pXTvy4FQRTH8c+OdUUoFApEIh5Cr6H2AFcn3kCi8wqeQDQiEiqNl9DrVP4kNyoa/3Y1Z9ns3bvunWbPnjPznd/M+Q1/I9XiKROOrAbpNXIZ8i5oVdjGM17Rb1FVhw4le3jBBY7xiaWob+IKR23QhDIgc3jAfUiejjkLWMc+rlE0lVRH6AesxEHLbqu4w0mbkjy+l7htTMgwE/FZQH7rqXGcrIVe4jtys3gzovdFbceio+Wp3tI0gVcKfOArFI0NSLFoCzvYwG4AUz6GQ8vwyXn44TE6cYPBOAoqn8xjgKfoWl5v3yi7lnFh79jDafwfBig1F61grQO6iOWud/HfZQ7FPxpILTyyRwgLAAAAAElFTkSuQmCC'

const ICON_2X =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACCUlEQVR42u3Xu4oUQRQG4G96xgvuYigYCIv6AmsgaiSrIIu+gJGrgYliZugDGOsDaCYYiYKCYiAoKwprYqYIgmLoZXVx1+k2OQ1F0zPTM0zvGlhQVPep6nP5669Tp/nHWyf6prcM3cp7tpnGyzaL3QPmWoMcDuAOPuITHuDQECdKxMremTTyDvbjM4pKX8XhWNttI/pS6d0w+AdPcA8bIXsZTmYVxOaxgOMx7qnhUSPoZyP6HI+T+VshW8NcDTGfVdC6XKN7JOGq7P+VyH8k870aPdsr79eDN3PjIFE68yiiWMdt3IzIC7xNSJbmiFNYwvkYX8f6F02RSEk4j581JCyw2JCEl/AKfVzFwQp3RqJwBMuBwu+I/PSQY9iNrelhR8iOBW8KXAxZr8lWbIvxaBL52QF7Peg0ZTiZnKZzgxyoiyYP+Uwi2xmK84anKk/WDk1MWQMFIpJ+23nfVt16/x3Y0noia8l4jq+VVJ7X2ctaqCc2op64FjlgA1einlhvYrOEbiFJREsNMtlE9UQ25eiLuAn3BuRPcT+QmMGNZN1UEZi0npg6B8auJ0bdTkVDw0Uo/46VqA8WI/JVXAiU3uFDPOdtkXCsemKaW5CHAys4gefhyBre4Awehs1+kzJpF/bF8xd8a8LgJBEJwnXxvmau9RTfGbC1tcdn1I9pMQYh6zLtpN+33/4Cy/GNOWxX/KIAAAAASUVORK5CYII='

/**
 * Marked as a template image, so macOS tints it itself: dark on a light menu
 * bar, light on a dark one, and inverted while the menu is open. That is why
 * the glyph is drawn as plain alpha with no colour of its own.
 */
export function createTrayIcon(): NativeImage {
  const icon = nativeImage.createFromDataURL(ICON_1X)
  icon.addRepresentation({ scaleFactor: 2, dataURL: ICON_2X })
  icon.setTemplateImage(true)
  return icon
}
