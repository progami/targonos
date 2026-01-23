import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const enabled = process.env.ATLAS_INTEGRATION_TEST === '1' && Boolean(process.env.DATABASE_URL)

test(
  'notification email dispatch uniqueness (requires ATLAS_INTEGRATION_TEST=1 and DATABASE_URL)',
  { skip: enabled ? undefined : 'integration tests disabled' },
  async () => {
    const { prisma } = await import('../../lib/prisma')

    const suffix = randomUUID().slice(0, 8)
    const employee = await prisma.employee.create({
      data: {
        employeeId: `EMP-${suffix}`,
        firstName: 'Test',
        lastName: 'Employee',
        email: `test.employee.${suffix}@example.com`,
        department: 'Test',
        position: 'Test',
        joinDate: new Date(),
      },
      select: { id: true },
    })

    const notification = await prisma.notification.create({
      data: {
        type: 'SYSTEM',
        title: 'Integration test notification',
        message: 'Notification created for integration test',
        link: '/hub',
        employeeId: employee.id,
        relatedType: 'SYSTEM',
        relatedId: `integration:${suffix}`,
      },
      select: { id: true },
    })

    const dispatches = await prisma.notificationEmailDispatch.findMany({
      where: { notificationId: notification.id, employeeId: employee.id },
      select: { id: true },
    })

    assert.equal(dispatches.length, 1)

    await assert.rejects(
      () =>
        prisma.notificationEmailDispatch.create({
          data: { notificationId: notification.id, employeeId: employee.id },
        }),
      /unique|P2002/i
    )
  }
)
