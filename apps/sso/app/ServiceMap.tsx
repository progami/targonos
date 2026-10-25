'use client'

import { useState } from 'react'

import {
  SEPARATE_HOSTS,
  SERVICE_LINES,
  SERVICE_STATIONS,
  stationsOnLine,
  type ServiceLineId,
  type ServiceProbe,
  type ServiceStation,
} from '@/lib/service-map'

import styles from './service-map.module.css'

type Selection = { kind: 'station'; id: string } | { kind: 'line'; id: ServiceLineId } | null

type ServiceMapProps = {
  cookieDomain: string
  portalHost: string
  probes: Map<string, ServiceProbe> | null
}

function describeProbe(probe: ServiceProbe | undefined, checking: boolean): { label: string; tone: 'up' | 'down' | 'pending' } {
  if (!probe) {
    return { label: checking ? 'Checking' : 'Not checked', tone: 'pending' }
  }
  if (probe.state === 'up') {
    return { label: `Up · ${probe.latencyMs} ms`, tone: 'up' }
  }
  return { label: probe.httpStatus === null ? 'Down · no response' : `Down · HTTP ${probe.httpStatus}`, tone: 'down' }
}

function StatusMark({ label, tone }: { label: string; tone: 'up' | 'down' | 'pending' }) {
  return (
    <span className={styles.status} data-tone={tone}>
      <span className={styles.statusDot} aria-hidden="true" />
      {label}
    </span>
  )
}

function lineSpan(lineId: ServiceLineId) {
  const indexes = SERVICE_STATIONS.flatMap((station, index) => (station.links[lineId] === undefined ? [] : [index]))
  return { first: indexes[0], last: indexes[indexes.length - 1] }
}

const LINE_SPANS = Object.fromEntries(SERVICE_LINES.map((line) => [line.id, lineSpan(line.id)])) as Record<
  ServiceLineId,
  { first: number; last: number }
>

export default function ServiceMap({ cookieDomain, portalHost, probes }: ServiceMapProps) {
  const [selection, setSelection] = useState<Selection>(null)
  const checking = probes === null

  const toggle = (next: NonNullable<Selection>) => {
    setSelection((current) => (current && current.kind === next.kind && current.id === next.id ? null : next))
  }

  const isStationLit = (station: ServiceStation) => {
    if (!selection) return true
    if (selection.kind === 'station') return selection.id === station.id
    return station.links[selection.id] !== undefined
  }

  const isLineLit = (lineId: ServiceLineId) => {
    if (!selection) return true
    if (selection.kind === 'line') return selection.id === lineId
    const station = SERVICE_STATIONS.find((entry) => entry.id === selection.id)
    return station?.links[lineId] !== undefined
  }

  const stationProbe = (station: ServiceStation) => {
    if (station.id === 'sso') {
      return { label: 'Serving this page', tone: 'up' as const }
    }
    return describeProbe(probes?.get(station.id), checking)
  }

  const selectedStation = selection?.kind === 'station'
    ? SERVICE_STATIONS.find((station) => station.id === selection.id)
    : undefined
  const selectedLine = selection?.kind === 'line'
    ? SERVICE_LINES.find((line) => line.id === selection.id)
    : undefined

  const workspaceMounts = SERVICE_STATIONS.filter((station) => station.id !== 'sso').map((station) => station.mount)

  return (
    <section className={styles.shell} aria-labelledby="system-map-title">
      <div className={styles.top}>
        <h2 id="system-map-title" className={styles.title}>System map</h2>
        <p className={styles.lede}>
          How a request reaches each workspace on <span className={styles.code}>{portalHost}</span>, and what each
          workspace depends on.
        </p>
      </div>

      <ol className={styles.route} aria-label="Request path">
        <li className={styles.routeStop}>
          <span className={styles.routeName}>Browser</span>
          <span className={styles.routeNote}>{portalHost}</span>
        </li>
        <li className={styles.routeStop}>
          <span className={styles.routeName}>Cloudflare Tunnel</span>
          <span className={styles.routeNote}>Named tunnel to the host</span>
        </li>
        <li className={styles.routeStop}>
          <span className={styles.routeName}>nginx</span>
          <span className={styles.routeNote}>Routes by path, one PM2 process per app</span>
        </li>
        <li className={styles.routeStop}>
          <span className={styles.routeName}>Portal</span>
          <span className={styles.routeNote}>Google sign-in, session cookie for {cookieDomain}</span>
        </li>
        <li className={`${styles.routeStop} ${styles.routeBranch}`}>
          <span className={styles.routeName}>Workspaces</span>
          <span className={`${styles.routeNote} ${styles.code}`}>{workspaceMounts.join('  ')}</span>
        </li>
      </ol>

      <div className={styles.board}>
        <div className={styles.matrixScroll}>
          <table className={styles.matrix} data-selecting={selection ? 'true' : undefined}>
            <caption className={styles.srOnly}>Shared services used by each part of TargonOS</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.cornerCell}>
                  <span className={styles.srOnly}>Service</span>
                </th>
                {SERVICE_LINES.map((line) => (
                  <th
                    key={line.id}
                    scope="col"
                    className={styles.lineHead}
                    data-line={line.id}
                    data-lit={isLineLit(line.id) ? 'true' : 'false'}
                  >
                    <button
                      type="button"
                      className={styles.lineButton}
                      aria-pressed={selection?.kind === 'line' && selection.id === line.id}
                      onClick={() => toggle({ kind: 'line', id: line.id })}
                    >
                      <span className={styles.lineSwatch} aria-hidden="true" />
                      {line.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICE_STATIONS.map((station, stationIndex) => {
                const status = stationProbe(station)
                return (
                  <tr key={station.id}>
                    <th scope="row" className={styles.stationHead} data-lit={isStationLit(station) ? 'true' : 'false'}>
                      <button
                        type="button"
                        className={styles.stationButton}
                        aria-pressed={selection?.kind === 'station' && selection.id === station.id}
                        onClick={() => toggle({ kind: 'station', id: station.id })}
                      >
                        <span className={styles.stationName}>{station.name}</span>
                        <span className={styles.stationMount}>{station.mount}</span>
                      </button>
                      <StatusMark label={status.label} tone={status.tone} />
                    </th>
                    {SERVICE_LINES.map((line) => {
                      const span = LINE_SPANS[line.id]
                      const onTrack = stationIndex >= span.first && stationIndex <= span.last
                      const note = station.links[line.id]
                      const lit = selection?.kind === 'line'
                        ? selection.id === line.id && onTrack
                        : isLineLit(line.id) && isStationLit(station)
                      return (
                        <td
                          key={line.id}
                          className={styles.cell}
                          data-line={line.id}
                          data-lit={lit ? 'true' : 'false'}
                          data-track={onTrack ? 'true' : undefined}
                          data-track-up={onTrack && stationIndex > span.first ? 'true' : undefined}
                          data-track-down={onTrack && stationIndex < span.last ? 'true' : undefined}
                          data-stop={note ? 'true' : undefined}
                          title={note ? `${line.name}: ${note}` : undefined}
                        >
                          {note ? (
                            <>
                              <span className={styles.stop} aria-hidden="true" />
                              <span className={styles.cellLabel}>
                                <span className={styles.cellLine}>{line.name}</span>
                                <span className={styles.cellNote}>{note}</span>
                              </span>
                            </>
                          ) : (
                            <span className={styles.srOnly}>Not used</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <aside className={styles.detail} aria-live="polite">
          {selectedStation ? (
            <>
              <h3 className={styles.detailTitle}>
                {selectedStation.name} <span className={styles.stationMount}>{selectedStation.mount}</span>
              </h3>
              <ul className={styles.detailList}>
                {SERVICE_LINES.filter((line) => selectedStation.links[line.id] !== undefined).map((line) => (
                  <li key={line.id} className={styles.detailItem} data-line={line.id}>
                    <span className={styles.lineSwatch} aria-hidden="true" />
                    <span>
                      <span className={styles.detailItemName}>{line.name}</span>
                      <span className={styles.detailItemNote}>{selectedStation.links[line.id]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : selectedLine ? (
            <>
              <h3 className={styles.detailTitle}>{selectedLine.name}</h3>
              <p className={styles.detailText}>{selectedLine.description}</p>
              <ul className={styles.detailList}>
                {stationsOnLine(selectedLine.id).map((station) => (
                  <li key={station.id} className={styles.detailItem} data-line={selectedLine.id}>
                    <span className={styles.lineSwatch} aria-hidden="true" />
                    <span>
                      <span className={styles.detailItemName}>{station.name}</span>
                      <span className={styles.detailItemNote}>{station.links[selectedLine.id]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3 className={styles.detailTitle}>Trace a connection</h3>
              <p className={styles.detailText}>
                Each column is a shared service drawn as a line. A dot means that workspace uses it. Select a
                workspace or a line to see exactly what is used and why.
              </p>
            </>
          )}
        </aside>
      </div>

      <div className={styles.hosts}>
        <h3 className={styles.hostsTitle}>Outside the portal</h3>
        <ul className={styles.hostList}>
          {SEPARATE_HOSTS.filter((host) => host.host !== portalHost).map((host) => {
            const status = describeProbe(probes?.get(host.id), checking)
            return (
              <li key={host.id} className={styles.host}>
                <a href={host.url} target="_blank" rel="noreferrer noopener" className={styles.hostLink}>
                  <span className={styles.hostName}>{host.name}</span>
                  <span className={styles.code}>{host.host}</span>
                </a>
                <span className={styles.hostNote}>{host.description}</span>
                <StatusMark label={status.label} tone={status.tone} />
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
