import Vue from "vue";
import {
  mapState,
  mapStoreMutations,
  mapStoreCollections,
  mapStoreComplexTypes,
  getCollectionPrefixes,
} from "./store";
import uuid from "./uuid";
import { getCases, getPeer } from "./_common";
import { useStore } from "vuex";

/**
 * The complete Triforce, or one or more components of the Triforce.
 * @typedef {Object} ComponentFactory
 * @param {Function} render - callback function that is called everytime the component is rendered: render ({ self, options }) { }
 * @param {Function} setup - callback function that is called when the component is ready to be returned: setup({ component }) { }
 */

/**
 * The complete Triforce, or one or more components of the Triforce.
 * @typedef {Object} CollectionItem
 * @property {String} single - the single form of the collection (item, person, job)
 * @property {String} plural - the plural form of the collection (list, people, jobs), would be the same as in the state
 * @property {String} id - the name of the id field of the object in the collection
 * @property {Object} type - the type of the objects in the array
 * @property {String} [upsertPrefix='saveOrUpdate'] - prefix of the save or update action
 * @property {String} [deletePrefix='delete'] - prefix of the delete action
 */

/**
 * The complete Triforce, or one or more components of the Triforce.
 * @typedef {Object} ComplexType
 * @property {String} name - the name of the field
 * @property {Object} type - the type of the object
 */

/**
 * wrapper a component and allow them to be modified at the render time, or even setup your properties, slots, etc.
 * @param {Object} param
 * @param {String} param.name - component's name
 * @param {Object} param.component - component to be wrapped
 * @param {Function} param.render - callback function that is called everytime the component is rendered: render ({ self, options }) { }
 * @param {Function} param.setup - callback function that is called when the component is ready to be returned: setup({ component }) { }
 * @param {Function} [param.createElement=function (h, component, options) {
     return h(component, options)
   }]
 * @param {ComponentFactory[]} param.factories - array of objects with a render and/or setup field
 */
const component = function ({
  name,
  component,
  render,
  setup,
  createElement,
  factories,
}) {
  const props = component.options.props;
  const computed = {};
  if (props.value) {
    computed.__value = {
      get() {
        return this.value;
      },
      set(value) {
        return this.$emit("input", value);
      },
    };
  }
  const methods = Object.keys(component.options.methods || {}).reduce(
    (methods, key) => {
      methods[key] = function (...args) {
        let root = this.$refs.root;
        return root[key].apply(root, args);
      };
      return methods;
    },
    {}
  );

  factories = factories || [];
  const renders = factories
    .filter((item) => item.render)
    .map((item) => item.render);
  if (render) {
    renders.push(render);
  }

  const setups = factories
    .filter((item) => item.setup)
    .map((item) => item.setup);
  if (setup) {
    setups.push(setup);
  }

  if (!createElement) {
    createElement = function (h, component, options) {
      return h(component, options);
    };
  }
  let wrapper = {
    name: name,
    props: props,
    methods: methods,
    computed: computed,
    render(h) {
      let self = this;
      let key = this.$vnode.key;
      let options = {
        key: key,
        ref: "root",
        scopedSlots: this.$scopedSlots,
        attrs: this.$attrs,
      };
      if (props.value) {
        let { values, ...props } = this.$props;
        let { input, ...listeners } = this.$listeners;
        props.value = self.__value;
        listeners.input = function (value) {
          self.__value = value;
        };
        options.props = props;
        options.on = listeners;
      } else {
        let { ...props } = this.$props;
        let { ...listeners } = this.$listeners;
        options.props = props;
        options.on = listeners;
      }

      for (let render of renders) {
        render({ self, options });
      }
      return createElement(h, component, options);
    },
  };
  for (let setup of setups) {
    setup({ component: wrapper });
  }
  return wrapper;
};

const __component = component;

/**
 * @param {String|Object} options
 * @param {Object} component
 * @param {Object} brand
 * @param {String|Object|Array} brand.style
 * @param {String|Object|Array} brand.class
 * @param {Object} brand.props
 */
const reBrand = function (options, component, brand) {
  let name = "",
    cname = "",
    register = null;
  if (typeof options === "object") {
    name = options.name;
    cname = options.cname;
    component = options.component;
    brand = options.brand;
    register = options.register;
  } else {
    name = options;
  }
  if (!cname) {
    cname = getCases(name).pascal;
  }
  if (!register) {
    register = function (name, component) {
      Vue.component(name, component);
    };
  }

  var keys = Object.keys(brand.props || {});
  register(
    name,
    __component({
      name: cname || component.name,
      component,
      render({ self, options }) {
        if (brand.style) {
          options.style = brand.style;
        }
        if (brand.class) {
          options.class = brand.class;
        }
        for (const prop of keys) {
          options.props[prop] =
            options.props[prop] === undefined
              ? brand.props[prop]
              : options.props[prop];
        }
        return null;
      },
      setup({ component }) {
        for (const prop of keys) {
          component.props[prop].default = () => undefined;
        }
      },
    })
  );
};

const merge = function ({ name, model, collections, complexTypes, user }) {
  let conditions = [
    model && model[name],
    collections && collections[name],
    !!user,
  ].filter((condition) => condition);

  if (conditions.length > 1) {
    let merged = {};
    let isFunc = false;
    if (user) {
      isFunc = isFunc || user.call;
      merged = user.call ? { ...merged, ...user() } : { ...merged, ...user };
    }
    if (model && model[name]) {
      isFunc = isFunc || model[name].call;
      merged = model[name].call
        ? { ...merged, ...model[name]() }
        : { ...merged, ...model[name] };
    }
    if (collections && collections[name]) {
      isFunc = isFunc || collections[name].call;
      merged = collections[name].call
        ? { ...merged, ...collections[name]() }
        : { ...merged, ...collections[name] };
    }
    if (complexTypes && complexTypes[name]) {
      isFunc = isFunc || complexTypes[name].call;
      merged = complexTypes[name].call
        ? { ...merged, ...complexTypes[name]() }
        : { ...merged, ...complexTypes[name] };
    }
    if (isFunc) {
      let __merged = merged;
      merged = function () {
        return JSON.parse(JSON.stringify(__merged));
      };
    }
    return merged;
  } else if (model && model[name]) {
    return model[name];
  } else if (collections && collections[name]) {
    return collections[name];
  } else if (complexTypes && complexTypes[name]) {
    return complexTypes[name];
  } else {
    return user;
  }
};

const preperValidation = function ({ store, fields }) {
  store.mutations = store.mutations || {};
  const fieldKeys = Object.keys(fields);
  for (const field of fieldKeys) {
    store.mutations[field] = function (state, value) {
      state[field] = value;
    };
  }

  store.state = store.state || {};
  let isFunc = !!store.state.call;
  if (isFunc) {
    store.state = store.state();
  }
  for (const field of fieldKeys) {
    store.state[field] = fields[field];
  }
  if (isFunc) {
    let obj = store.state;
    store.state = function () {
      return { ...obj };
    };
  }
};

const validationField = "@@";
const fetchedField = "@tmu_fetch";
/**
 * factory.store combines store.mapStoreMutations and store.mapStoreCollections.
 * @param {Object} param - the page properties (`created`, `computed`, `etc`)
 * @param {Object} param.options - options used to generate the page
 * @param {Object} param.options.model - class used to model the mutations object
 * @param {CollectionItem[]} param.options.collections - an array of objects that describes your collection
 * @param {ComplexType[]} param.options.collections - an array of objects that describes your collection
 * @param {String} param.state - module's state, that will be merged intro the final module
 * @param {String} param.mutations - module's mutations, that will be merged intro the final module
 * @param {String} param.actions - module's actions, that will be merged intro the final module
 * @param {String} param.getters - module's getters, that will be merged intro the final module
 */
const store = function ({ options, initialize, ...store }) {
  let model, collections, complexTypes;
  if (options && options.model) {
    model = {
      state: function () {
        return new options.model();
      },
      mutations: mapStoreMutations(options.model),
    };
  }
  if (options && options.collections && options.collections.length > 0) {
    collections = mapStoreCollections(options.collections);
  }
  if (options && options.complexTypes && options.complexTypes.length > 0) {
    complexTypes = mapStoreComplexTypes(options.complexTypes);
  }

  preperValidation({
    store,
    fields: {
      [validationField]: 0,
      [fetchedField]: false,
    },
  });
  store.namespaced = true;
  store.state = merge({
    name: "state",
    model,
    collections,
    complexTypes,
    user: store.state,
  });
  store.mutations =
    merge({
      name: "mutations",
      model,
      collections,
      complexTypes,
      user: store.mutations,
    }) || {};
  store.actions =
    merge({
      name: "actions",
      model,
      collections,
      complexTypes,
      user: store.actions,
    }) || {};
  store.getters = merge({
    name: "getters",
    model,
    collections,
    complexTypes,
    user: store.getters,
  });
  if (!store.actions.initialize) {
    store.actions.initialize = initialize || function (context, values) {};
  }
  return store;
};

/**
 * factory.page will expect the same options as factory.store and will map the state, mutations, actions and getters generated by factory.store to the page.
 * @param {Object} param - the page properties (`created`, `computed`, `etc`)
 * @param {Object} param.options - options used to generate the page
 * @param {Object} param.options.model - class used to model the mutations object
 * @param {CollectionItem[]} param.options.collections - an array of objects that describes your collection
 * @param {Object} param.storeModule - if not null, it'll be registered in the preFetch or in the created hook, and removed in the destroyed hook.
 * @param {String} param.moduleName - the prefix of the private fields used by the getters and setters
 */
const page = function ({ options, storeModule, moduleName, ...page }) {
  let { preFetch, created, mounted, destroyed, setup } = page;

  const checkModule = function ({ store, success, failure }) {
    if (storeModule.mutations[validationField]) {
      let comb = uuid.comb();
      let mutationName = `${moduleName}/${validationField}`;
      if (store.state[moduleName] && store._mutations[mutationName]) {
        store.commit(mutationName, comb);
        let value = (store.state[moduleName] || {})[validationField];
        if (value === comb) {
          if (success) success();
        } else {
          if (failure) failure();
        }
      } else if (failure) {
        failure();
      }
    }
  };

  /*
  const getFetched = function ({ store }) {
    let fetched =
      store.state[moduleName] && store.state[moduleName][fetchedField];
    if (!fetched) {
      fetched = {};
      fetched.chain = new Promise((resolve) => {
        fetched.resolve = resolve;
      });
      fetched.timeout = setTimeout(() => {
        if (store.state[moduleName])
          store.commit(`${moduleName}/${fetchedField}`, false);

        fetched.resolve();
      }, 150);
      if (store.state[moduleName])
        store.commit(`${moduleName}/${fetchedField}`, fetched);
    }
    return fetched;
  };
  */

  if (storeModule) {
    page.preFetch = function (context) {
      let self = this;
      let { store, currentRoute, previousRoute, redirect } = context;
      checkModule({
        store,
        success() {
          store.unregisterModule(moduleName);
        },
      });
      store.registerModule(moduleName, storeModule);

      let fetched = store.state[moduleName][fetchedField];
      if (fetched.timeout) {
        clearTimeout(fetched.timeout);
      }
      store
        .dispatch(`${moduleName}/initialize`, {
          route: currentRoute,
          from: previousRoute,
          next: redirect,
        })
        .then(function () {
          if (preFetch) {
            return preFetch.apply(self, [context]);
          }
        })
        .then(function () {
          if (fetched.resolve) {
            fetched.resolve();
          }
          store.commit(`${moduleName}/${fetchedField}`, true);
        });
    };

    page.created = function () {
      /*
      let self = this;
      let $store = useStore();
      var fetched = getFetched({ store: $store });
      let exec = function () {
        let fetched = $store.state[moduleName][fetchedField];
        checkModule({
          store: $store,
          failure() {
            $store.registerModule(moduleName, storeModule, {
              preserveState: fetched,
            });
          },
        });

        if (created) {
          created.apply(self, []);
        }
      };
      if (fetched.chain) {
        fetched.chain.then(exec);
      } else {
        exec();
      }
      */
      if (created) {
        created.apply(this, []);
      }
    };

    page.mounted = function () {
      /*
      let self = this;
      var fetched = getFetched({ store: $store });
      let exec = function () {
        let fetched = $store.state[moduleName][fetchedField];
        if (!fetched) {
          const args = self.$route
            ? {
                route: self.$route,
                next: self.$router.replace.bind(self.$router),
              }
            : undefined;

          $store.dispatch(`${moduleName}/initialize`, args);
        } else {
          $store.commit(`${moduleName}/${fetchedField}`, false);
        }
        if (mounted) {
          mounted.apply(self, []);
        }
      };

      if (fetched.chain) {
        fetched.chain.then(exec);
      } else {
        exec();
      }
      */
      this.$store.commit(`${moduleName}/${fetchedField}`, false);
      if (mounted) {
        mounted.apply(this, []);
      }
    };

    page.destroyed = function () {
      let self = this;
      if (destroyed) {
        destroyed.apply(self, []);
      }
      checkModule({
        store: this.$store,
        success() {
          self.$store.unregisterModule(moduleName);
        },
      });
    };

    page.setup = function (props, context) {
      let self = this;
      let setupReturn = {};
      let $store = useStore();

      if (options && options.model) {
        let keys = Object.keys(new options.model());
        setupReturn = {
          ...setupReturn,
          ...mapState($store, moduleName, keys),
        };
      }

      if (options && options.collections) {
        let actions = {};
        let getters = {};
        let defaultPrefixes = getCollectionPrefixes();
        let hasTypes = options.collections.some(
          (collection) => collection.type !== void 0
        );
        if (hasTypes) {
          actions.setPropertyOfACollectionItem = function ({
            id,
            collection,
            property,
            value,
          }) {
            return $store.dispatch(
              `${moduleName}/setPropertyOfACollectionItem`,
              {
                id,
                collection,
                property,
                value,
              }
            );
          };
        }

        for (let collection of options.collections) {
          let single = getCases(collection.single);
          let plural = getCases(collection.plural);
          let upsertPrefix =
            collection.upsertPrefix || defaultPrefixes.upsertPrefix;
          let deletePrefix =
            collection.deletePrefix || defaultPrefixes.deletePrefix;
          actions[`${upsertPrefix}${single.pascal}`] = function (item) {
            return $store.dispatch(
              `${moduleName}/${upsertPrefix}${single.pascal}`,
              item
            );
          };
          actions[`${deletePrefix}${single.pascal}`] = function (id) {
            return $store.dispatch(
              `${moduleName}/${deletePrefix}${single.pascal}`,
              id
            );
          };
          getters[`${plural.camel}Index`] = computed(function () {
            let getter =
              $store.getters[
                `${moduleName}/${moduleName}/${plural.camel}Index`
              ];
            if (getter) {
              return getter;
            } else {
              let state = $store.state[moduleName];
              return storeModule.getters[`${plural.camel}Index`](state, this);
            }
          });
          getters[`${single.camel}ById`] = computed(function () {
            let $store = useStore();
            let getter = $store.getters[`${moduleName}/${single.camel}ById`];
            if (getter) {
              return getter;
            } else {
              let state = $store.state[moduleName];
              return storeModule.getters[`${single.camel}ById`](state, this);
            }
          });
          if (collection.type !== void 0) {
            let properties = Object.keys(new collection.type());
            for (const property of properties) {
              let name = getCases(property);
              let conjunction = single.pascal.match(/^[aeiou].*/i) ? "An" : "A";
              let actionName = `set${name.pascal}Of${conjunction}${single.pascal}`;
              actions[actionName] = function ({ id, value }) {
                let $store = useStore();
                return $store.dispatch(`${moduleName}/${actionName}`, {
                  id,
                  collection: collection.plural,
                  property,
                  value,
                });
              };
            }
          }
        }

        setupReturn = {
          ...setupReturn,
          ...getters,
          ...actions,
        };
      }
      if (options && options.complexTypes) {
        let getters = {};
        for (let complexType of options.complexTypes) {
          let properties = Object.keys(new complexType.type());
          let typeName = getCases(complexType.name);
          for (const property of properties) {
            const name = getCases(property);
            const camelName = `${name.camel}Of${typeName.pascal}`;
            const pascalName = `set${name.pascal}Of${typeName.pascal}`;
            getters[camelName] = computed({
              get() {
                return $store.state[moduleName][complexType.name][property];
              },
              set(value) {
                $store.commit(`${moduleName}/${pascalName}`, value);
              },
            });
          }
        }
        setupReturn = {
          ...setupReturn,
          ...getters,
        };
      }

      if (setup) {
        setupReturn = {
          ...setupReturn,
          ...setup.apply(self, [props, context]),
        };
      }
      return setupReturn;
    };
  }
  return page;
};

export { reBrand, component, store, page };

export default {
  reBrand,
  component,
  store,
  page,
};
