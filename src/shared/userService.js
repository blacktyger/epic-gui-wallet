import { BaseService } from "./base_service";
import { useStore } from '@/store';

class UserService extends BaseService {



    constructor() {
        super();
        this.tableName = "User";
        this.store = useStore();
    }

    getUser(account) {

        return this.connection.select({
            from: this.tableName,
            where: {
                account: account
            }
        })
    }

    /* the User row of a wallet (account = the wallet id, w1, w2, ...): created when missing, else
       these columns updated; committed as store.user. settings.json is where nodeInternal,
       epicbox_domain and the language live; the row mirrors them for code that reads
       store.state.user, and contacts point at its id. fields: {name, language, nodeInternal,
       epicbox_domain}, a missing one is left as it is (a new row gets a default). */
    async ensureUser(walletId, fields = {}) {
        if(!walletId){
            throw new Error('ensureUser: no wallet id');
        }
        const set = {};
        for(const k of ['name', 'language', 'epicbox_domain']){
            if(fields[k] !== undefined && fields[k] !== null) set[k] = String(fields[k]);
        }
        if(fields.nodeInternal !== undefined) set.nodeInternal = !!fields.nodeInternal;

        let rows = await this.getUser(walletId);
        if(rows.length){
            if(Object.keys(set).length){
                await this.connection.update({in: this.tableName, set: set, where: {account: walletId}});
                rows = await this.getUser(walletId);
            }
        }else{
            //every NOT NULL column of the stored schema (idbService), the legacy ones empty
            rows = await this.connection.insert({
                into: this.tableName,
                values: [{
                    account: walletId, name: '', email: '', keybase: '', ngrok: '', language: 'en',
                    nodeInternal: false, ngrok_force_start: false, epicbox_domain: '', ...set,
                }],
                return: true
            });
        }
        if(!rows || !rows.length){
            throw new Error('ensureUser: the User row of ' + walletId + ' could not be saved');
        }
        this.store.commit('user', rows[0]);
        return rows[0];
    }

    /* a removed wallet's rows: its contacts (Addressbook) and their transaction links
       (AddressTransactions) by User.id, then the User row. Nothing to do when it has none.
       → the number of rows removed per table */
    async removeUser(walletId){
        if(!walletId){
            throw new Error('removeUser: no wallet id');
        }
        const out = {Addressbook: 0, AddressTransactions: 0, User: 0};
        const rows = await this.getUser(walletId);
        for(const row of rows || []){
            for(const table of ['AddressTransactions', 'Addressbook']){
                out[table] += await this.connection.remove({from: table, where: {user_id: row.id}}) || 0;
            }
        }
        out.User = await this.connection.remove({from: this.tableName, where: {account: walletId}}) || 0;
        return out;
    }

}

export default UserService;
