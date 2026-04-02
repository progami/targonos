(function () {
  const REPLICA_VERSION = 'amazon-pdp-v1'
  const SLOT_ATTR = 'data-argus-slot'

  function setSlot(selector, slot) {
    const el = document.querySelector(selector)
    if (!el) return
    el.setAttribute(SLOT_ATTR, slot)
  }

  function bindSlots() {
    document.documentElement.setAttribute('data-argus-replica', REPLICA_VERSION)

    setSlot('#imageBlock', 'gallery-root')
    setSlot('#landingImage', 'gallery-landing-image')
    setSlot('#altImages ul[aria-label="Image thumbnails"]', 'gallery-thumbnails')
    setSlot('#altImages li.videoThumbnail', 'gallery-video-thumb')
    setSlot('#main-video-container', 'video-container')
    setSlot('#titleSection', 'title')
    setSlot('#feature-bullets', 'bullets-root')
    setSlot('#feature-bullets ul', 'bullets-list')
    setSlot('#corePriceDisplay_desktop_feature_div', 'price-root')
    setSlot('#aplusBrandStory_feature_div', 'ebc-brand-root')
    setSlot('#aplus_feature_div', 'ebc-description-root')
    setSlot('#twister_feature_div', 'variations-root')
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSlots, { once: true })
  } else {
    bindSlots()
  }
})()
