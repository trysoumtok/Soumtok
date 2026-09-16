const catalog = require('../shared/modelCatalog.js')

const STATIC_DESKTOP_MODELS = catalog.MODELS

function staticDesktopModels(ready = false) {
  return catalog.staticDesktopModels(ready)
}

module.exports = { STATIC_DESKTOP_MODELS, staticDesktopModels, RECOMMENDED_MODEL_IDS: catalog.RECOMMENDED_MODEL_IDS }
