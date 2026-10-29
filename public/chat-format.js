;(function (global) {
  const tags = { tiktok: '[TT]', youtube: '[YT]' }
  function formatChat(event, template, options) {
    const values = {
      platformTag: options?.tags?.[event.platform] || tags[event.platform] || '',
      platform: event.platform || '', author: event.author || '', message: event.message || '',
    }
    return String(template || '{author}: {message}').replace(/\{(platformTag|platform|author|message)\}/g, (_, key) => values[key])
  }
  global.ChatFormat = { formatChat, tags }
})(window)
