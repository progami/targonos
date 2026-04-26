(function () {
  const REPLICA_VERSION = 'amazon-pdp-v1'
  const SLOT_ATTR = 'data-argus-slot'

  function requireElement(selector) {
    const el = document.querySelector(selector)
    if (!el) {
      throw new Error(`[Argus replica] Missing required selector: ${selector}`)
    }
    return el
  }

  function setSlot(selector, slot) {
    const el = requireElement(selector)
    el.setAttribute(SLOT_ATTR, slot)
  }

  function reorderBelowTheFold() {
    const zone = requireElement('#Desktop-Detailed-Evaluation-Zone')
    const productVideos = requireElement('#va-related-videos-widget_feature_div')
    const brandStory = requireElement('#aplusBrandStory_feature_div')
    const subNav = requireElement('#btfSubNavDesktopCopy')
    const productDetails = requireElement('#productDetails_feature_div')
    const productDescription = requireElement('#aplus_feature_div')

    zone.insertBefore(brandStory, subNav)
    zone.insertBefore(productDescription, subNav)
    zone.insertBefore(productDetails, productDescription.nextSibling)
    zone.insertBefore(productVideos, productDetails.nextSibling)
  }

  function bindSlots() {
    document.documentElement.setAttribute('data-argus-replica', REPLICA_VERSION)
    reorderBelowTheFold()

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
