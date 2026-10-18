import { BaseService } from "./base_service";

class AddressbookService extends BaseService {



    constructor() {
        super();
        this.tableName = "Addressbook";
    }

    clear(){
      return this.connection.clear(this.tableName);
    }

    getAddress(user_id) {

        return this.connection.select({
            from: this.tableName,
            where: {
                user_id: user_id
            },
            order: {
                by: 'name',
                type: 'asc' //supprted sort type is - asc,desc
            }
        })
    }

    addAddress(address) {
        return this.connection.insert({
            into: this.tableName,
            //legacy: keybase is a NOT NULL column in the stored schema (see idbService)
            values: [{keybase: '', ...address}],
            return: true
        })
    }

    findAddress(value) {
        return this.connection.select({
            from: this.tableName,
            where: {
                name: {
                  like: '%'+ value +'%'
                },
                or: {
                  country: {
                    like: '%'+ value +'%'
                  },
                  city: {
                    like: '%'+ value +'%'
                  },
                  onion: {
                    like: '%'+ value +'%'
                  },
                  proofaddr: {
                    like: '%'+ value +'%'
                  },
                  externalOne: {
                    like: '%'+ value +'%'
                  },
                  externalTwo: {
                    like: '%'+ value +'%'
                  },
                  notice: {
                    like: '%'+ value +'%'
                  }
                },

            }
        })
    }

    getAddressById(id) {
        return this.connection.select({
            from: this.tableName,
            where: {
                id: id
            }
        })
    }

    removeAddress(id) {
        return this.connection.remove({
            from: this.tableName,
            where: {
                id: id
            }
        })
    }

    updateAddressById(id, updateData) {
        return this.connection.update({
            in: this.tableName,
            set: updateData,
            where: {
                id: id
            }
        })
    }
}

export default AddressbookService;
