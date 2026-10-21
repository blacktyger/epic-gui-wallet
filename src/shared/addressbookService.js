import { BaseService } from "./base_service";
import { contactFields, searchContacts } from "./contacts.js";

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
            //every text column a string: JsStore rejects a null or missing NOT NULL one
            values: [{keybase: '', ...address, ...contactFields(address)}],
            return: true
        })
    }

    /* the wallet's contacts that contain value (plain text, any case): searched here, not by a JsStore
       'like' (which makes a RegExp of the text and looks at every wallet's contacts) */
    async findAddress(user_id, value, opts) {
        return searchContacts(await this.getAddress(user_id), value, opts);
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
            set: contactFields(updateData),
            where: {
                id: id
            }
        })
    }
}

export default AddressbookService;
