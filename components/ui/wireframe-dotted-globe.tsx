"use client"

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"
import { geoBounds, geoGraticule, geoOrthographic, geoPath, timer, type GeoPermissibleObjects } from "d3"

/** Natural Earth 110m land polygons (public domain). Pass `dataUrl` to use a self-hosted copy. */
const DEFAULT_DATA_URL =
  "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/110m/physical/ne_110m_land.json"

export interface RotatingEarthHandle {
  /**
   * Spin the globe until `target` ([lng, lat]) faces the viewer, optionally zooming by `zoom`
   * (1 = normal size). Auto-rotation stops. Resolves when the animation ends.
   */
  flyTo(target: [number, number], options?: { duration?: number; zoom?: number }): Promise<void>
}

interface RotatingEarthProps {
  width?: number
  height?: number
  className?: string
  /** Globe fill. */
  oceanColor?: string
  /** Rim, graticule and coastline color. */
  strokeColor?: string
  /** Halftone land dot color. */
  dotColor?: string
  /** Optional [lng, lat] to pin with a pulsing marker (e.g. Ann Arbor). */
  marker?: [number, number]
  markerColor?: string
  /** Starting rotation, [lambda, phi]. */
  initialRotation?: [number, number]
  /** Degrees per frame (at 60 fps). */
  rotationSpeed?: number
  /** Show the "Drag to rotate • Scroll to zoom" hint. */
  showHint?: boolean
  /** GeoJSON FeatureCollection of land polygons. Defaults to Natural Earth 110m land on GitHub. */
  dataUrl?: string
  /**
   * Size the globe to its parent (which needs a size) instead of `width`/`height`,
   * and follow it when it resizes.
   */
  fill?: boolean
  /** Scroll to zoom. Turn off on scrolling pages so the wheel keeps scrolling the page. */
  zoomable?: boolean
  /** Drag to rotate. */
  draggable?: boolean
  /** Imperative controls, e.g. `flyTo`. */
  ref?: Ref<RotatingEarthHandle>
}

// ---------------------------------------------------------------------------
// Land data, fetched and turned into halftone dots once per URL and shared by every globe.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LandCollection = { type: "FeatureCollection"; features: any[] }

interface Land {
  collection: LandCollection
  /** Dot longitudes (radians) and the sine/cosine of their latitudes. */
  lambda: Float32Array
  sinPhi: Float32Array
  cosPhi: Float32Array
}

const landCache = new Map<string, Promise<Land>>()

const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pointInFeature = (point: [number, number], feature: any): boolean => {
  const geometry = feature.geometry
  const polygons: number[][][][] =
    geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : []
  for (const polygon of polygons) {
    // In the outer ring and not in a hole.
    if (pointInPolygon(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInPolygon(point, hole))) return true
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateDotsInFeature = (feature: any, out: number[], dotSpacing = 16) => {
  const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(feature)
  const stepSize = dotSpacing * 0.08
  for (let lng = minLng; lng <= maxLng; lng += stepSize) {
    for (let lat = minLat; lat <= maxLat; lat += stepSize) {
      if (pointInFeature([lng, lat], feature)) out.push(lng, lat)
    }
  }
}

function loadLand(url: string): Promise<Land> {
  let pending = landCache.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load land data")
        return response.json() as Promise<LandCollection>
      })
      .then((collection) => {
        const lngLat: number[] = []
        collection.features.forEach((feature) => generateDotsInFeature(feature, lngLat))
        const n = lngLat.length / 2
        const lambda = new Float32Array(n)
        const sinPhi = new Float32Array(n)
        const cosPhi = new Float32Array(n)
        for (let i = 0; i < n; i++) {
          const phi = (lngLat[i * 2 + 1] * Math.PI) / 180
          lambda[i] = (lngLat[i * 2] * Math.PI) / 180
          sinPhi[i] = Math.sin(phi)
          cosPhi[i] = Math.cos(phi)
        }
        return { collection, lambda, sinPhi, cosPhi }
      })
    pending.catch(() => landCache.delete(url))
    landCache.set(url, pending)
  }
  return pending
}

const RAD = Math.PI / 180
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// ---------------------------------------------------------------------------

export default function RotatingEarth({
  width = 800,
  height = 600,
  className = "",
  oceanColor = "#000000",
  strokeColor = "#ffffff",
  dotColor = "#999999",
  marker,
  markerColor = "#FFCB05",
  initialRotation = [0, 0],
  rotationSpeed: speed = 0.5,
  showHint = true,
  dataUrl = DEFAULT_DATA_URL,
  fill = false,
  zoomable = true,
  draggable = true,
  ref,
}: RotatingEarthProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const apiRef = useRef<RotatingEarthHandle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (target, options) => apiRef.current?.flyTo(target, options) ?? Promise.resolve(),
    }),
    [],
  )

  const markerLng = marker?.[0]
  const markerLat = marker?.[1]
  const rotLambda = initialRotation[0]
  const rotPhi = initialRotation[1]

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const markerPoint: [number, number] | null =
      markerLng !== undefined && markerLat !== undefined ? [markerLng, markerLat] : null

    // Size. `fill` follows the parent; otherwise the original fixed size, capped by the window.
    let containerWidth = 0
    let containerHeight = 0
    let radius = 1
    let dpr = 1
    const projection = geoOrthographic().clipAngle(90)
    const path = geoPath().projection(projection).context(context)
    const graticule = geoGraticule()()

    const measure = (): boolean => {
      let w: number
      let h: number
      if (fill) {
        w = Math.max(1, Math.round(root.clientWidth))
        h = Math.max(1, Math.round(root.clientHeight))
        dpr = Math.min(window.devicePixelRatio || 1, 2)
      } else {
        w = Math.min(width, window.innerWidth - 40)
        h = Math.min(height, window.innerHeight - 100)
        dpr = window.devicePixelRatio || 1
      }
      if (w === containerWidth && h === containerHeight) return false
      const zoom = projection.scale() / radius
      containerWidth = w
      containerHeight = h
      radius = fill ? Math.max(1, Math.min(w, h) / 2 - 3) : Math.min(w, h) / 2.5
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      projection.translate([w / 2, h / 2]).scale(radius * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1))
      return true
    }
    projection.scale(1)
    measure()

    // Dots are sized for the original 250px-ish globe; in `fill` mode they follow the globe's size.
    const dotRadius = () => (fill ? Math.min(1.5, Math.max(0.75, radius / 230)) * 1.2 : 1.2)

    let land: Land | null = null
    let disposed = false
    const startedAt = performance.now()

    const render = (now: number) => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, containerWidth, containerHeight)

      const currentScale = projection.scale()
      const scaleFactor = currentScale / radius
      const [cx, cy] = projection.translate()

      // Ocean and rim.
      context.beginPath()
      context.arc(cx, cy, currentScale, 0, 2 * Math.PI)
      context.fillStyle = oceanColor
      context.fill()
      context.strokeStyle = strokeColor
      context.lineWidth = 2 * scaleFactor
      context.stroke()

      // Graticule.
      context.beginPath()
      path(graticule)
      context.lineWidth = 1 * scaleFactor
      context.globalAlpha = 0.25
      context.stroke()
      context.globalAlpha = 1

      if (land) {
        // Coastlines (clipped to the near side).
        context.beginPath()
        land.collection.features.forEach((feature) => path(feature as GeoPermissibleObjects))
        context.lineWidth = 1 * scaleFactor
        context.stroke()

        // Halftone dots: near side solid, far side a faint see-through ghost.
        const [lambda0, phi0] = projection.rotate()
        const l0 = lambda0 * RAD
        const cosP0 = Math.cos(phi0 * RAD)
        const sinP0 = Math.sin(phi0 * RAD)
        const r = dotRadius() * scaleFactor
        const front = new Path2D()
        const back = new Path2D()
        const { lambda, sinPhi, cosPhi } = land
        for (let i = 0; i < lambda.length; i++) {
          const lam = lambda[i] + l0
          const x = cosPhi[i] * Math.cos(lam)
          const y = cosPhi[i] * Math.sin(lam)
          const z = sinPhi[i]
          const px = cx + currentScale * y
          const py = cy - currentScale * (z * cosP0 + x * sinP0)
          if (px < 0 || px > containerWidth || py < 0 || py > containerHeight) continue
          const target = x * cosP0 - z * sinP0 > 0 ? front : back
          target.moveTo(px + r, py)
          target.arc(px, py, r, 0, 2 * Math.PI)
        }
        context.fillStyle = dotColor
        context.globalAlpha = 0.14
        context.fill(back)
        context.globalAlpha = 1
        context.fill(front)
      }

      // Pulsing marker, only while it's on the near side.
      if (markerPoint) {
        const [lambda0, phi0] = projection.rotate()
        const lam = (markerPoint[0] + lambda0) * RAD
        const phi = markerPoint[1] * RAD
        const x = Math.cos(phi) * Math.cos(lam)
        const y = Math.cos(phi) * Math.sin(lam)
        const z = Math.sin(phi)
        const cosP0 = Math.cos(phi0 * RAD)
        const sinP0 = Math.sin(phi0 * RAD)
        if (x * cosP0 - z * sinP0 > 0) {
          const px = cx + currentScale * y
          const py = cy - currentScale * (z * cosP0 + x * sinP0)
          const t = reduceMotion ? 0.35 : ((now - startedAt) / 1400) % 1
          context.beginPath()
          context.arc(px, py, (4 + t * 18) * scaleFactor, 0, 2 * Math.PI)
          context.strokeStyle = markerColor
          context.globalAlpha = 1 - t
          context.lineWidth = 2 * scaleFactor
          context.stroke()
          context.globalAlpha = 1
          context.beginPath()
          context.arc(px, py, 4.5 * scaleFactor, 0, 2 * Math.PI)
          context.fillStyle = markerColor
          context.fill()
        }
      }
    }

    // Rotation, interaction and animation.
    const rotation: [number, number] = [rotLambda, rotPhi]
    projection.rotate(rotation)
    let autoRotate = true
    let dragging = false
    const rotationSpeed = reduceMotion ? 0 : speed
    let dirty = true
    let lastFrame = performance.now()
    let lastRender = 0
    let flight: {
      start: number
      duration: number
      from: [number, number]
      delta: [number, number]
      fromScale: number
      toScale: number
      resolve: () => void
    } | null = null

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(64, now - lastFrame)
      lastFrame = now
      if (flight) {
        const p = flight.duration > 0 ? Math.min(1, (now - flight.start) / flight.duration) : 1
        const e = easeInOutCubic(p)
        rotation[0] = flight.from[0] + flight.delta[0] * e
        rotation[1] = flight.from[1] + flight.delta[1] * e
        projection.rotate(rotation).scale(flight.fromScale + (flight.toScale - flight.fromScale) * e)
        dirty = true
        if (p >= 1) {
          const done = flight.resolve
          flight = null
          done()
        }
      } else if (autoRotate && !dragging && rotationSpeed) {
        rotation[0] += rotationSpeed * (dt / (1000 / 60))
        projection.rotate(rotation)
        dirty = true
      }
      // Idle spinning is slow, so 30 fps is plenty; interaction and flights run at full rate.
      const busy = dragging || flight !== null
      const pulsing = markerPoint !== null && !reduceMotion
      if (!dirty && !pulsing) return
      if (!busy && fill && now - lastRender < 32) return
      lastRender = now
      dirty = false
      render(now)
    }

    let rotationTimer: ReturnType<typeof timer> | null = null
    const start = () => {
      if (!rotationTimer && !disposed) {
        lastFrame = performance.now()
        rotationTimer = timer(tick)
      }
    }
    const stop = () => {
      rotationTimer?.stop()
      rotationTimer = null
    }

    apiRef.current = {
      flyTo(target, options = {}) {
        return new Promise<void>((resolve) => {
          flight?.resolve()
          autoRotate = false
          const to: [number, number] = [-target[0], -target[1]]
          const dLambda = ((((to[0] - rotation[0]) % 360) + 540) % 360) - 180
          flight = {
            start: performance.now(),
            duration: reduceMotion ? 0 : (options.duration ?? 900),
            from: [rotation[0], rotation[1]],
            delta: [dLambda, to[1] - rotation[1]],
            fromScale: projection.scale(),
            toScale: radius * (options.zoom ?? 1),
            resolve,
          }
          start()
        })
      },
    }

    // Drag to rotate (mouse, pen and touch). On touch, vertical swipes still scroll the page.
    let resumeTimer: ReturnType<typeof setTimeout> | undefined
    const handlePointerDown = (event: PointerEvent) => {
      if (!draggable || event.button > 0 || flight) return
      dragging = true
      autoRotate = false
      clearTimeout(resumeTimer)
      const startX = event.clientX
      const startY = event.clientY
      const startRotation: [number, number] = [rotation[0], rotation[1]]
      const sensitivity = fill ? Math.min(0.5, 90 / radius) : 0.5
      canvas.setPointerCapture?.(event.pointerId)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        rotation[0] = startRotation[0] + (moveEvent.clientX - startX) * sensitivity
        rotation[1] = Math.max(-90, Math.min(90, startRotation[1] - (moveEvent.clientY - startY) * sensitivity))
        projection.rotate(rotation)
        dirty = true
        if (!rotationTimer) render(performance.now())
      }
      const handlePointerUp = () => {
        canvas.removeEventListener("pointermove", handlePointerMove)
        canvas.removeEventListener("pointerup", handlePointerUp)
        canvas.removeEventListener("pointercancel", handlePointerUp)
        dragging = false
        resumeTimer = setTimeout(() => {
          if (!flight) autoRotate = true
        }, 10)
      }
      canvas.addEventListener("pointermove", handlePointerMove)
      canvas.addEventListener("pointerup", handlePointerUp)
      canvas.addEventListener("pointercancel", handlePointerUp)
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.9 : 1.1
      projection.scale(Math.max(radius * 0.5, Math.min(radius * 3, projection.scale() * factor)))
      dirty = true
      if (!rotationTimer) render(performance.now())
    }

    canvas.style.touchAction = draggable ? "pan-y" : ""
    canvas.addEventListener("pointerdown", handlePointerDown)
    if (zoomable) canvas.addEventListener("wheel", handleWheel, { passive: false })

    // Only animate while the globe is on screen.
    let onScreen = true
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) start()
      else if (!flight) stop()
    })
    io.observe(canvas)

    let ro: ResizeObserver | undefined
    if (fill) {
      ro = new ResizeObserver(() => {
        if (measure()) render(performance.now())
      })
      ro.observe(root)
    }

    loadLand(dataUrl)
      .then((loaded) => {
        if (disposed) return
        land = loaded
        dirty = true
        render(performance.now())
        setIsLoading(false)
      })
      .catch(() => {
        if (disposed) return
        // In `fill` mode a bare wireframe globe is a better fallback than an error box.
        if (!fill) setError("Failed to load land map data")
        setIsLoading(false)
      })

    render(performance.now())
    if (onScreen) start()

    return () => {
      disposed = true
      stop()
      clearTimeout(resumeTimer)
      flight?.resolve()
      flight = null
      apiRef.current = null
      io.disconnect()
      ro?.disconnect()
      canvas.removeEventListener("pointerdown", handlePointerDown)
      canvas.removeEventListener("wheel", handleWheel)
    }
  }, [
    width,
    height,
    oceanColor,
    strokeColor,
    dotColor,
    markerColor,
    speed,
    dataUrl,
    fill,
    zoomable,
    draggable,
    markerLng,
    markerLat,
    rotLambda,
    rotPhi,
  ])

  if (error) {
    return (
      <div className={`dark flex items-center justify-center bg-card rounded-2xl p-8 ${className}`}>
        <div className="text-center">
          <p className="dark text-destructive font-semibold mb-2">Error loading Earth visualization</p>
          <p className="dark text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={`relative ${fill ? "h-full w-full" : ""} ${className}`} data-loading={isLoading || undefined}>
      <canvas
        ref={canvasRef}
        className={fill ? "absolute inset-0 block bg-transparent dark" : "w-full h-auto rounded-2xl bg-transparent dark"}
        style={fill ? undefined : { maxWidth: "100%", height: "auto" }}
      />
      {showHint && (
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground px-2 py-1 rounded-md dark bg-neutral-900">
          Drag to rotate • Scroll to zoom
        </div>
      )}
    </div>
  )
}
