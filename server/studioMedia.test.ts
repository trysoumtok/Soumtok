import assert from 'node:assert/strict'
import test from 'node:test'
import { falStillFromResponse, replicateInput, replicateOutputUrl } from './studioMedia.ts'

test('replicate output may be a URL string or an array of URLs', () => {
  assert.equal(replicateOutputUrl('https://replicate.delivery/still.jpg'), 'https://replicate.delivery/still.jpg')
  assert.equal(
    replicateOutputUrl(['https://replicate.delivery/a.jpg', 'https://replicate.delivery/b.jpg']),
    'https://replicate.delivery/a.jpg',
  )
  assert.equal(replicateOutputUrl({ url: 'https://replicate.delivery/obj.jpg' }), 'https://replicate.delivery/obj.jpg')
  assert.equal(replicateOutputUrl({ output: ['https://replicate.delivery/nested.jpg'] }), 'https://replicate.delivery/nested.jpg')
  assert.equal(replicateOutputUrl('not-a-url'), '')
})

test('fal still parser still reads images[0].url', () => {
  const still = falStillFromResponse({ images: [{ url: 'https://fal.media/a.jpg', content_type: 'image/jpeg' }] })
  assert.equal(still.url, 'https://fal.media/a.jpg')
})

test('replicate input matches Flux 2 Max vs Imagen 4 Ultra', () => {
    const imagen = replicateInput('google/imagen-4-ultra', 'a watch')
  assert.equal(imagen.safety_filter_level, 'block_only_high')
  assert.equal(imagen.aspect_ratio, '1:1')
  assert.equal(imagen.prompt_upsampling, undefined)
  const flux = replicateInput('black-forest-labs/flux-2-max', 'a watch')
  assert.equal(flux.resolution, '2 MP')
  assert.equal(flux.output_quality, 95)
  assert.equal(flux.prompt_upsampling, false)
})
