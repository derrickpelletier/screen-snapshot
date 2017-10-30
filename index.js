const path = require('path')
const fs = require('fs')
const makeDir = require('make-dir')
const b64 = require('base64-js')
const pixelmatch = require('pixelmatch')
const { PNG } = require('pngjs')

const IMG_DIR = '__img_snapshots__'
const SENSITIVITY = 0.001 // 0.1%

const defaultComparison = (data1, data2) => {
  const img1 = PNG.sync.read(data1)
  const img2 = PNG.sync.read(data2)
  const { width, height } = img1

  const diff = new PNG({width, height})
  const options = { threshold: 0.1 }
  const mismatched = pixelmatch(img1.data, img2.data, diff.data, width, height, options)
  return {
    data: PNG.sync.write(diff),
    percent: mismatched / (width * height)
  }
}

class Comparison {
  constructor (dir, id, screenshot) {
    this.screenshot = Buffer.from(b64.toByteArray(screenshot))
    this.dir = dir
    this.id = id
    this.sensitivity = SENSITIVITY
    this.paths = {
      img: path.join(this.dir, IMG_DIR),
      existing: path.join(this.dir, IMG_DIR, `${this.id}.snap.png`),
      diff: path.join(this.dir, IMG_DIR, `${this.id}.diff.png`)
    }
  }

  getExisting () {
    if (!fs.existsSync(this.paths.existing)) return null
    return fs.readFileSync(this.paths.existing)
  }

  compare () {
    makeDir.sync(this.paths.img)
    const existing = this.getExisting()
    if (!existing) {
      fs.writeFileSync(this.paths.existing, this.screenshot)
      return true
    }
    const { data, percent } = defaultComparison(existing, this.screenshot)
    if (percent <= this.sensitivity) return true
    fs.writeFile(this.paths.diff, data, err => {
      if (err) throw err
    })
    return false
  }
}

const generateComparison = (dir, id, screenshot) => {
  const comparison = new Comparison(dir, id, screenshot)
  return comparison.compare()
}

module.exports = generateComparison

/**
 * convenience method for use with AVA
 * generates the id string and screenshot-count per test
 */
module.exports.ava = (t, dir, screenshot) => {
  if (!t.context._screenshotCount) t.context._screenshotCount = 0
  t.context._screenshotCount++

  const id = `${t.title}_${t.context._screenshotCount}`

  const result = generateComparison(dir, id, screenshot)
  if (!result) return t.fail('Error: visual regression detected.')
  return t.pass()
}
