// HalaChat - ترقيم موحّد وآمن
// كان `limit * 1` يمرّر أي قيمة من العميل (?limit=100000) فيسحب الـ collection كاملاً

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * يقرأ page/limit من الـ query بحدود آمنة.
 * @param {object} query - req.query
 * @param {object} [opts] - { defaultLimit, maxLimit }
 * @returns {{page:number, limit:number, skip:number}}
 */
function getPagination(query = {}, opts = {}) {
    const defaultLimit = opts.defaultLimit || DEFAULT_LIMIT;
    const maxLimit = opts.maxLimit || MAX_LIMIT;

    let page = parseInt(query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;

    let limit = parseInt(query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
    if (limit > maxLimit) limit = maxLimit;

    return { page, limit, skip: (page - 1) * limit };
}

module.exports = { getPagination, DEFAULT_LIMIT, MAX_LIMIT };
