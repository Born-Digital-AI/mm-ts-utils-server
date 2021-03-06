import { BaseModel, BaseModelData } from 'mm-ts-utils';
import { TableDao, TableDaoOptions } from '../mm-sql/TableDao';
import { SqlUtil } from '../mm-sql/SqlUtil';

export const assertWhereNotString = (where) => {
    if (typeof where === 'string') {
        throw new Error('`where` as string is not supported at model level');
    }
};

/**
 * takes care of common usual use-cases... it's ok to overwrite if special case
 * is needed, and is also OK not to be tied up with the usual cases...
 */
export class Service<TModel extends BaseModel<BaseModelData>> {
    protected _tableName: string;

    protected _daoOptions: TableDaoOptions;

    protected _modelCtor: any;

    protected _isDeletedColName: null | string;

    constructor(protected _db?: SqlUtil) {}

    get tableName() {
        return this._tableName;
    }

    set db(db: SqlUtil | null) {
        this._db = db;
    }

    get db() {
        if (!this._db) {
            throw new Error('SqlUtil instance not provided');
        }
        return this._db;
    }

    get dao() {
        return new TableDao(
            this._tableName,
            Object.assign({}, { db: this.db }, this._daoOptions || {})
        );
    }

    /**
     * low level fetcher - to be overridden for custom needs
     * @param pk
     * @param assert
     * @param debug
     * @private
     */
    protected async _fetchRow(pk, assert, debug) {
        return this.dao.fetchRow(pk, assert, debug);
    }

    /**
     * @param id
     * @param assert
     * @param debug
     */
    async find(id, assert: boolean = true, debug?): Promise<TModel> {
        let pk = { id };
        if (this._isDeletedColName) {
            pk = { ...pk, [this._isDeletedColName]: 0 };
        }
        const row = await this._fetchRow(pk, assert, debug);
        return row ? new this._modelCtor(row) : null;
    }

    /**
     * @param where
     * @param assert
     * @param debug
     */
    async findWhere(where, assert: boolean = false, debug?): Promise<TModel> {
        assertWhereNotString(where);
        if (this._isDeletedColName) {
            where = { ...where, [this._isDeletedColName]: 0 };
        }
        const row = await this._fetchRow(where, assert, debug);
        return row ? new this._modelCtor(row) : null;
    }

    /**
     * @param where
     * @param options
     * @param debug
     */
    async fetchAll(where?, options?, debug?): Promise<TModel[]> {
        assertWhereNotString(where);
        if (this._isDeletedColName) {
            where = { ...where, [this._isDeletedColName]: 0 };
        }
        let rows = await this.dao.fetchAll(where, options, debug);
        return (rows as any[]).map((row) => new this._modelCtor(row));
    }

    /**
     * @param where
     * @returns {Promise<number>}
     */
    async fetchCount(where?): Promise<number> {
        assertWhereNotString(where);
        if (this._isDeletedColName) {
            where = { ...where, [this._isDeletedColName]: 0 };
        }
        return this.dao.fetchCount(where);
    }

    /**
     * @param model
     * @param debug
     */
    async save(model: TModel, debug?): Promise<TModel> {
        if (!model.isDirty()) {
            return model;
        }
        let data = await this.dao.save(model.toJSONSerialized(), debug);
        model.populate(data);

        // model was just saved...
        model.resetDirty();

        return model;
    }

    /**
     * @todo: implement + test for composite PK
     * @param idOrModel
     * @param {boolean} hard
     * @param debug
     * @returns {Promise<any>}
     */
    async delete(idOrModel, hard: boolean = false, debug?): Promise<any> {
        // somewhat naive...
        const id = idOrModel instanceof BaseModel ? idOrModel.id : idOrModel;
        if (!id) {
            throw new Error('(Service.delete) missing required id');
        }

        if (hard || !this._isDeletedColName) {
            return this.dao.delete(id, debug);
        } else {
            let { idCol } = this.dao.options;
            let pkData = id;
            // common use case: just id
            if (!Array.isArray(idCol) && /string|number/.test(typeof pkData)) {
                pkData = { [idCol]: pkData };
            }

            await this.dao.update(
                { [this._isDeletedColName]: 1 },
                this.dao.buildPkWhereFrom(pkData),
                debug
            );
        }
    }
}
