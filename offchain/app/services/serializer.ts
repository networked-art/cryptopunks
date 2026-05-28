import { BaseSerializer } from '@adonisjs/core/transformers'

class ApiSerializer extends BaseSerializer {
  wrap = undefined
  definePaginationMetaData(metaData: unknown) {
    return metaData
  }
}

const serializer = new ApiSerializer()
export const serialize = serializer.serialize.bind(serializer)
