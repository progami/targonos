import Link from 'next/link'
import styles from './xplanArchive.module.css'

export default function XplanArchivePage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.kicker}>Decommissioned</p>
        <h1>xPlan is archived</h1>
        <p>
          Planning and inventory evidence now lives in Sellerboard, QuickBooks, and Plutus. Do not use xPlan as a
          source of truth.
        </p>
        <Link href="/" className={styles.link}>Back to portal</Link>
      </section>
    </main>
  )
}
