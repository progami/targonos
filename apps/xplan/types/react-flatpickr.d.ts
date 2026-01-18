declare module 'react-flatpickr' {
  import type { ComponentType } from 'react'
  import type { Instance as FlatpickrInstance, Options as FlatpickrOptions } from 'flatpickr'

  export interface ReactFlatpickrProps {
    value?: Date | string | (Date | string)[]
    options?: FlatpickrOptions
    onChange?: (selectedDates: Date[], dateStr: string, instance: FlatpickrInstance) => void
    className?: string
    placeholder?: string
    disabled?: boolean
    defaultValue?: string
    render?: (...args: any[]) => JSX.Element
  }

  const ReactFlatpickr: ComponentType<ReactFlatpickrProps>
  export default ReactFlatpickr
}
