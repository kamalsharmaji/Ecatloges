import { useUpdateBusiness } from '@/api/businesses'
import { Card, CardBody, PageHeader } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { BusinessForm } from '@/features/business/BusinessForm'
import { RequirePermission } from '@/routes/guards'

export function BusinessProfilePage() {
  const { context, can } = useActiveBusiness()
  const update = useUpdateBusiness(context?.business.id ?? '')
  if (!context) return null
  const editable = can('business.update')

  return (
    <RequirePermission codes={['business.view']}>
      <PageHeader title="Business profile" description="These details appear on your public catalogues." />
      {!editable && (
        <Alert tone="info" className="mb-4">
          You can view this profile. Only members with permission to edit the business can change it.
        </Alert>
      )}
      <Card>
        <CardBody>
          <BusinessForm
            initial={context.business}
            readOnly={!editable}
            submitLabel="Save changes"
            onSubmit={(values) => update.mutateAsync(values)}
          />
        </CardBody>
      </Card>
    </RequirePermission>
  )
}
