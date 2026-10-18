import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeaveBusiness } from '@/api/businesses'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useActiveBusiness } from '@/features/business/BusinessContext'

export function LeaveBusinessCard() {
  const { context, clear } = useActiveBusiness()
  const leave = useLeaveBusiness()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (!context) return null

  return (
    <Card className="border-red-200">
      <CardHeader
        title={`Leave ${context.business.name}`}
        description="You'll lose access immediately. If you're the only owner, transfer ownership first."
      />
      <CardBody>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Leave business
        </Button>
        <ConfirmDialog
          open={open}
          onClose={() => {
            setOpen(false)
            leave.reset()
          }}
          onConfirm={() =>
            leave.mutate(undefined, {
              onSuccess: () => {
                clear()
                navigate('/businesses', { replace: true })
              },
            })
          }
          loading={leave.isPending}
          error={leave.error?.message}
          title="Leave this business?"
          description={`You will be removed from ${context.business.name}. Someone will need to invite you again to rejoin.`}
          confirmLabel="Leave business"
        />
      </CardBody>
    </Card>
  )
}
