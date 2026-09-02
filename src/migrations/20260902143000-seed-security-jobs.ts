import { QueryInterface } from 'sequelize'
import { randomUUID } from 'node:crypto'

export const up = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const now = new Date()

  // Find SEC department
  const secDept = await queryInterface.rawSelect('departments', { where: { code: 'SEC' } }, ['id'])

  if (secDept) {
    const jobCategoriesData = [
      {
        departmentId: String(secDept),
        code: 'SEC_GATE',
        name: 'Gate & Security',
        description: 'Gate & Security staff',
      },
    ]

    for (const jc of jobCategoriesData) {
      const existing = await queryInterface.rawSelect('job_categories', { where: { code: jc.code } }, ['id'])
      if (!existing) {
        await queryInterface.bulkInsert('job_categories', [
          {
            id: randomUUID(),
            departmentId: jc.departmentId,
            code: jc.code,
            name: jc.name,
            description: jc.description,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        ])
      }
    }
  }
}

export const down = async ({ context: queryInterface }: { context: QueryInterface }) => {
  await queryInterface.bulkDelete('job_categories', {
    code: ['SEC_GATE'],
  })
}
