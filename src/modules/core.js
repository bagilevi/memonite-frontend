console.log('core module loaded');

define(['jquery'], ($) => {
  const Memonite = window.Memonite = {
    VERSION: '{{VERSION}}',
    editors: [],
    loadScript,
    loadCss,
    loadPluginScript,
    loadPluginCss,
    initResourceEditor,
    define,
    require,
    showError,
  }

  const { display } = Memonite;
  var startupTimePrinted = false

  window.onerror = function(message, url, lineNumber) {
    showError(message)
  }

  function showError(message) {
    var container = $('#error-container').first();
    if (container.length === 0) container = $('<div id="error-container">').appendTo($('body'))
    const msgEl = $('<div class="error-flash">').append($('<p>').text(message));
    container.append(msgEl);
    msgEl.fadeOut({ duration: 10000 }, () => msgEl.remove());
    msgEl.on('click', () => msgEl.remove())
  }

  $(document).ready(() => {
    window.authenticityToken = $('meta[name=csrf-token]').attr('content')
    Promise.all([
      loadPluginScript('memonite-ui',      Memonite.VERSION),
      loadPluginScript('memonite-linking', Memonite.VERSION),
      loadPluginScript('memonite-spa',     Memonite.VERSION),
      loadPluginScript('memonite-storage', Memonite.VERSION),
    ]).then(() => {
      console.log('core scripts loaded')
      initResourceEditorFromDocument()
    }).catch((err) => {
      console.error('Could not load all modules, editor cannot be initialized.', err)
    })
  })

  // Find the main resource on the page and load its editor
  function initResourceEditorFromDocument() {
    console.log('initResourceEditorFromDocument')
    const el = $('.m-resource').first()
    if (el.length) {
      const resource = {
        id: el.data('m-id'),
        url: window.location.href,
        path: window.location.pathname,
        editor: el.data('m-editor'),
        editor_url: el.data('m-editor-url'),
        body: el.html(),
      }
      initResourceEditor(resource, el)
    }
    else {
      // In case the document is the _spa_dummy, i.e. it doesn't contain content
      initResourceEditorFromLocation()
    }
  }

  function initResourceEditorFromLocation() {
    Memonite.storage.getResource(location.href)
      .then(resource => {
        Memonite.spa.showResource(resource)
      })
      .catch(err => {
        console.error('Cannot initialize editor because could not get resource from storage', err)
      })
  }

  function initResourceEditor(resource, el) {
    console.log('initResourceEditor', resource, el)
    const scriptUrl = getEditorUrl(resource)
    require([scriptUrl], (editorLoader) => {
      if (!editorLoader) {
        throw new Error(`Script loaded from "${scriptUrl}" did not return anything`)
      }
      const editor = editorLoader(Memonite)
      if (!editor) {
        throw new Error(`Script loaded from "${scriptUrl}" expected to define editor "${resource.editor}"`)
      }
      const changeReceiver = Memonite.storage.createEditorChangeReceiver(resource);
      editor.init(el, changeReceiver);
      if (MEMONITE_START_TIME && !startupTimePrinted) {
        console.log('Editor loaded in', performance.now() - MEMONITE_START_TIME, 'ms')
        startupTimePrinted = true
      }
    })
  }


  var scripts = {}

  function loadScript(url) {
    if (!url) throw new Error('blank url given to loadScript')
    var s = scripts[url];
    if (s) return Promise.resolve();
    return new Promise((resolve, reject) => {
      $.ajax({
        url: url,
        dataType: 'script',
        success: () => {
          scripts[url] = true;
          resolve();
        },
        error: (jqXHR, textStatus, errorThrown) => {
          console.error(`loadScript(${url})`, '$.ajax failed', textStatus, errorThrown)
          reject(errorThrown)
        },
        async: true
      });
    })
  }

  function loadCss(url) {
    return new Promise((resolve, reject) => {
      const linkEl = $('<link>').attr('rel', 'stylesheet').attr('href', url).attr('type', 'text/css')
      linkEl.get(0).onload = resolve
      $('head').append(linkEl)
    })
  }

  function loadPluginScript(name, version) {
    return new Promise((resolve, reject) => {
      const url = buildPluginUrl(name, version, 'js')
      require([url], (result) => {
        console.log('loadPluginScript', name, '=> ', result)
        result(Memonite);
        resolve();
      })
    })
  }

  function buildPluginUrl(name, version, type) {
    const ver = version ? `-v${version}` : ''
    const ext = type ? `.${type}` : ''
    return `${MEMONITE_PLUGIN_PATH}/${name}${ver}${ext}`
  }

  function loadPluginCss(name, version) {
    return loadCss(buildPluginUrl(name, version, 'css'))
  }

  function debounce(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  function getEditorUrl(resource) {
    const { editor, editor_url } = resource
    if (!editor) throw new Error('resource does not have "editor" property')
    return buildPluginUrl(editor, null, 'js')
    // return `/plugin?name=${editor}&url=${editor_url}&type=js`
  }

})
