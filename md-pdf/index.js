'use strict';
var path = require('path');
var fs = require('fs');
var url = require('url');
var os = require('os');
var INSTALL_CHECK = false;

async function MarkdownPdf(option_type, file) {

    try {

        var mdfilename = file;
        var ext = path.extname(mdfilename);
        if (!isExistsPath(mdfilename)) {
            if (editor.document.isUntitled) {
                vscode.window.showWarningMessage('Please save the file!');
                return;
            }
            vscode.window.showWarningMessage('File name does not get!');
            return;
        }

        var types_format = ['html', 'pdf', 'png', 'jpeg'];
        var filename = '';
        var types = [];
        if (types_format.indexOf(option_type) >= 0) {
            types[0] = option_type;
        } else if (option_type === 'settings') {
            var types_tmp = vscode.workspace.getConfiguration('markdown-pdf')['type'] || 'pdf';
            if (types_tmp && !Array.isArray(types_tmp)) {
                types[0] = types_tmp;
            } else {
                types = vscode.workspace.getConfiguration('markdown-pdf')['type'] || 'pdf';
            }
        } else if (option_type === 'all') {
            types = types_format;
        } else {
            showErrorMessage('MarkdownPdf().1 Supported formats: html, pdf, png, jpeg.');
            return;
        }

        // convert and export markdown to pdf, html, png, jpeg
        if (types && Array.isArray(types) && types.length > 0) {
            for (var i = 0; i < types.length; i++) {
                var type = types[i];
                if (types_format.indexOf(type) >= 0) {
                    filename = mdfilename.replace(ext, '.' + type);

                    // read file
                    var text = fs.readFileSync(file, 'utf8');

                    var content = convertMarkdownToHtml(mdfilename, type, text);

                    // make uri
                    var uri = "file://" + file;

                    var html = makeHtml(content, uri, file);
                    await exportPdf(html, filename, type, uri);


                } else {
                    showErrorMessage('MarkdownPdf().2 Supported formats: html, pdf, png, jpeg.');
                    return;
                }
            }
        } else {
            showErrorMessage('MarkdownPdf().3 Supported formats: html, pdf, png, jpeg.');
            return;
        }
    } catch (error) {
        showErrorMessage('MarkdownPdf()', error);
    }
}

/*
 * convert markdown to html (markdown-it)
 */
function convertMarkdownToHtml(filename, type, text) {
    try {
        try {
            var hljs = require('highlight.js');
            var breaks = false;
            var md = require('markdown-it')({
                html: true,
                breaks: breaks,
                highlight: function (str, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        try {
                            str = hljs.highlight(lang, str, true).value;
                        } catch (error) {
                            str = md.utils.escapeHtml(str);

                            showErrorMessage('markdown-it:highlight', error);
                        }
                    } else {
                        str = md.utils.escapeHtml(str);
                    }
                    return '<pre class="hljs"><code><div>' + str + '</div></code></pre>';
                }
            });
        } catch (error) {
            statusbarmessage.dispose();
            showErrorMessage('require(\'markdown-it\')', error);
        }

        // convert the img src of the markdown
        var cheerio = require('cheerio');
        var defaultRender = md.renderer.rules.image;
        md.renderer.rules.image = function (tokens, idx, options, env, self) {
            var token = tokens[idx];
            var href = token.attrs[token.attrIndex('src')][1];
            // console.log("original href: " + href);
            if (type === 'html') {
                href = decodeURIComponent(href).replace(/("|')/g, '');
            } else {
                href = convertImgPath(href, filename);
            }
            // console.log("converted href: " + href);
            token.attrs[token.attrIndex('src')][1] = href;
            // // pass token to default renderer.
            return defaultRender(tokens, idx, options, env, self);
        };

        if (type !== 'html') {
            // convert the img src of the html
            md.renderer.rules.html_block = function (tokens, idx) {
                var html = tokens[idx].content;
                var $ = cheerio.load(html);
                $('img').each(function () {
                    var src = $(this).attr('src');
                    var href = convertImgPath(src, filename);
                    $(this).attr('src', href);
                });
                return $.html();
            };
        }

        // checkbox
        md.use(require('markdown-it-checkbox'));

        // emoji
        var f = true;
        if (f) {
            var emojies_defs = require(path.join(__dirname, 'data', 'emoji.json'));
            try {
                var options = {
                    defs: emojies_defs
                };
            } catch (error) {
                showErrorMessage('markdown-it-emoji:options', error);
            }
            md.use(require('markdown-it-emoji'), options);
            md.renderer.rules.emoji = function (token, idx) {
                var emoji = token[idx].markup;
                var emojipath = path.join(__dirname, 'node_modules', 'emoji-images', 'pngs', emoji + '.png');
                var emojidata = readFile(emojipath, null).toString('base64');
                if (emojidata) {
                    return '<img class="emoji" alt="' + emoji + '" src="data:image/png;base64,' + emojidata + '" />';
                } else {
                    return ':' + emoji + ':';
                }
            };
        }

        // toc
        // https://github.com/leff/markdown-it-named-headers
        var options = {
            slugify: Slug
        }
        md.use(require('markdown-it-named-headers'), options);

        // markdown-it-container
        // https://github.com/markdown-it/markdown-it-container
        md.use(require('markdown-it-container'), '', {
            validate: function (name) {
                return name.trim().length;
            },
            render: function (tokens, idx) {
                if (tokens[idx].info.trim() !== '') {
                    return `<div class="${tokens[idx].info.trim()}">\n`;
                } else {
                    return `</div>\n`;
                }
            }
        });

        // PlantUML
        // https://github.com/gmunguia/markdown-it-plantuml
        md.use(require('markdown-it-plantuml'));

        return md.render(text);

    } catch (error) {
        statusbarmessage.dispose();
        showErrorMessage('convertMarkdownToHtml()', error);
    }
}

/*
 * https://github.com/Microsoft/vscode/blob/b3a1b98d54e2f7293d6f018c97df30d07a6c858f/extensions/markdown/src/markdownEngine.ts
 * https://github.com/Microsoft/vscode/blob/b3a1b98d54e2f7293d6f018c97df30d07a6c858f/extensions/markdown/src/tableOfContentsProvider.ts
 */
function Slug(string) {
    try {
        var stg = encodeURI(string.trim()
            .toLowerCase()
            .replace(/[\]\[\!\"\#\$\%\&\'\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`]/g, '')
            .replace(/\s+/g, '-')
            .replace(/^\-+/, '')
            .replace(/\-+$/, ''));
        return stg;
    } catch (error) {
        showErrorMessage('Slug()', error);
    }
}

/*
 * make html
 */
function makeHtml(data, uri, filepath) {
    try {
        // read styles
        var style = '';
        style += readStyles(uri);

        // get title
        var title = path.basename(filepath);

        // read template
        var filename = path.join(__dirname, 'template', 'template.html');
        var template = readFile(filename);

        // compile template
        var mustache = require('mustache');

        var view = {
            title: title,
            style: style,
            content: data
        };
        return mustache.render(template, view);
    } catch (error) {
        showErrorMessage('makeHtml()', error);
    }
}

/*
 * export a html to a html file
 */
function exportHtml(data, filename) {
    fs.writeFileSync(filename, data, 'utf-8');
}

/*
 * export a html to a pdf file (html-pdf)
 */
async function exportPdf(data, filename, type, uri) {

    var exportFilename = getOutputDir(filename, uri);
    var doIt = async function () {

        try {
            // export html
            if (type == 'html') {
                exportHtml(data, exportFilename);
                vscode.window.setStatusBarMessage('$(markdown) ' + exportFilename, StatusbarMessageTimeout);
                return;
            }

            const puppeteer = require('puppeteer');
            // create temporary file
            var f = path.parse(filename);
            var tmpfilename = path.join(f.dir, f.name + '_tmp.html');
            exportHtml(data, tmpfilename);
            var options = {
                executablePath: undefined,
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"]
            }
            const browser = await puppeteer.launch(options).catch(error => {
                showErrorMessage('puppeteer.launch()', error);
            });
            const page = await browser.newPage().catch(error => {
                showErrorMessage('browser.newPage()', error);
            });;
            await page.goto('file://' + tmpfilename, {
                waitUntil: 'networkidle0'
            }).catch(error => {
                showErrorMessage('page.goto()', error);
            });;

            // generate pdf
            // https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions
            if (type == 'pdf') {
                // If width or height option is set, it overrides the format option.
                // In order to set the default value of page size to A4, we changed it from the specification of puppeteer.
                var width_option = '';
                var height_option = '';
                var format_option = '';
                if (!width_option && !height_option) {
                    format_option = 'Letter';
                }
                var landscape_option = false;
                var options = {
                    path: exportFilename,
                    scale: 1,
                    displayHeaderFooter: false,
                    headerTemplate: '',
                    footerTemplate: '',
                    printBackground: true,
                    landscape: landscape_option,
                    pageRanges: '',
                    format: format_option,
                    width: '',
                    height: '',
                    margin: {
                        top: '10mm',
                        right: '10mm',
                        bottom: '10mm',
                        left: '10mm'
                    }
                }
                await page.pdf(options).catch(error => {
                    showErrorMessage('page.pdf', error);
                });
            }

            await browser.close();

            // delete temporary file
            var debug = false;
            if (!debug) {
                if (isExistsPath(tmpfilename)) {
                    deleteFile(tmpfilename);
                }
            }
        } catch (error) {
            showErrorMessage('exportPdf()', error);
        }
    }

    await doIt();

    console.log(exportFilename + " created successfully!")
}

function isExistsPath(path) {
    if (path.length === 0) {
        return false;
    }
    try {
        fs.accessSync(path);
        return true;
    } catch (error) {
        console.warn(error.message);
        return false;
    }
}

function isExistsDir(dirname) {
    if (dirname.length === 0) {
        return false;
    }
    try {
        if (fs.statSync(dirname).isDirectory()) {
            return true;
        } else {
            console.warn('Directory does not exist!');
            return false;
        }
    } catch (error) {
        console.warn(error.message);
        return false;
    }
}

function deleteFile(path) {
    var rimraf = require('rimraf')
    rimraf(path, function (error) {
        if (error) throw error;
    });
}

function getOutputDir(filename, resource) {
    try {
        var outputDir;
        if (resource === undefined) {
            return filename;
        }
        var outputDirectory = '';
        if (outputDirectory.length === 0) {
            return filename;
        }

        // Use a home directory relative path If it starts with ~.
        if (outputDirectory.indexOf('~') === 0) {
            outputDir = outputDirectory.replace(/^~/, os.homedir());
            mkdir(outputDir);
            return path.join(outputDir, path.basename(filename));
        }

        // Use path if it is absolute
        if (path.isAbsolute(outputDirectory)) {
            if (!isExistsDir(outputDirectory)) {
                showErrorMessage(`The output directory specified by the markdown-pdf.outputDirectory option does not exist. Check the markdown-pdf.outputDirectory option. ` + outputDirectory);
                return;
            }
            return path.join(outputDirectory, path.basename(filename));
        }

        // Use a workspace relative path if there is a workspace and markdown-pdf.outputDirectoryRootPath = workspace
        var outputDirectoryRelativePathFile = false;
        let root = vscode.workspace.getWorkspaceFolder(resource);
        if (outputDirectoryRelativePathFile === false && root) {
            outputDir = path.join(root.uri.fsPath, outputDirectory);
            mkdir(outputDir);
            return path.join(outputDir, path.basename(filename));
        }

        // Otherwise look relative to the markdown file
        outputDir = path.join(path.dirname(resource.fsPath), outputDirectory);
        mkdir(outputDir);
        return path.join(outputDir, path.basename(filename));
    } catch (error) {
        showErrorMessage('getOutputDir()', error);
    }
}

function mkdir(path) {
    if (isExistsDir(path)) {
        return;
    }
    var mkdirp = require('mkdirp');
    return mkdirp.sync(path);
}

function readFile(filename, encode) {
    if (filename.length === 0) {
        return '';
    }
    if (!encode && encode !== null) {
        encode = 'utf-8';
    }
    if (filename.indexOf('file://') === 0) {
        if (process.platform === 'win32') {
            filename = filename.replace(/^file:\/\/\//, '')
                .replace(/^file:\/\//, '');
        } else {
            filename = filename.replace(/^file:\/\//, '');
        }
    }
    if (isExistsPath(filename)) {
        return fs.readFileSync(filename, encode);
    } else {
        return '';
    }
}

function convertImgPath(src, filename) {
    try {
        var href = decodeURIComponent(src);
        href = href.replace(/("|')/g, '')
            .replace(/\\/g, '/')
            .replace(/#/g, '%23');
        var protocol = url.parse(href).protocol;
        if (protocol === 'file:' && href.indexOf('file:///') !== 0) {
            return href.replace(/^file:\/\//, 'file:///');
        } else if (protocol === 'file:') {
            return href;
        } else if (!protocol || path.isAbsolute(href)) {
            href = path.resolve(path.dirname(filename), href).replace(/\\/g, '/')
                .replace(/#/g, '%23');
            if (href.indexOf('//') === 0) {
                return 'file:' + href;
            } else if (href.indexOf('/') === 0) {
                return 'file://' + href;
            } else {
                return 'file:///' + href;
            }
        } else {
            return src;
        }
    } catch (error) {
        showErrorMessage('convertImgPath()', error);
    }
}

function makeCss(filename) {
    try {
        var css = readFile(filename);
        if (css) {
            return '\n<style>\n' + css + '\n</style>\n';
        } else {
            return '';
        }
    } catch (error) {
        showErrorMessage('makeCss()', error);
    }
}

function readStyles(uri) {
    try {
        var includeDefaultStyles;
        var style = '';
        var styles = '';
        var filename = '';
        var i;

        includeDefaultStyles = true;

        // 1. read the style of the vscode.
        if (includeDefaultStyles) {
            filename = path.join(__dirname, 'styles', 'markdown.css');
            style += makeCss(filename);
        }

        // 2. read the style of the markdown.styles setting.
        if (includeDefaultStyles) {
            styles = []
            if (styles && Array.isArray(styles) && styles.length > 0) {
                for (i = 0; i < styles.length; i++) {
                    var href = fixHref(uri, styles[i]);
                    style += '<link rel=\"stylesheet\" href=\"' + href + '\" type=\"text/css\">';
                }
            }
        }

        // 3. read the style of the highlight.js.
        var highlightStyle = '';
        var ishighlight = true;
        if (ishighlight) {
            if (highlightStyle) {
                var css = 'github.css';
                filename = path.join(__dirname, 'node_modules', 'highlight.js', 'styles', css);
                style += makeCss(filename);
            } else {
                filename = path.join(__dirname, 'styles', 'tomorrow.css');
                style += makeCss(filename);
            }
        }

        // 4. read the style of the markdown-pdf.
        if (includeDefaultStyles) {
            filename = path.join(__dirname, 'styles', 'markdown-pdf.css');
            style += makeCss(filename);
        }

        // 5. read the style of the markdown-pdf.styles settings.
        styles = [];
        if (styles && Array.isArray(styles) && styles.length > 0) {
            for (i = 0; i < styles.length; i++) {
                var href = fixHref(uri, styles[i]);
                style += '<link rel=\"stylesheet\" href=\"' + href + '\" type=\"text/css\">';
            }
        }

        return style;
    } catch (error) {
        showErrorMessage('readStyles()', error);
    }
}

/*
 * vscode/extensions/markdown-language-features/src/features/previewContentProvider.ts fixHref()
 * https://github.com/Microsoft/vscode/blob/0c47c04e85bc604288a288422f0a7db69302a323/extensions/markdown-language-features/src/features/previewContentProvider.ts#L95
 *
 * Extension Authoring: Adopting Multi Root Workspace APIs ?E Microsoft/vscode Wiki
 * https://github.com/Microsoft/vscode/wiki/Extension-Authoring:-Adopting-Multi-Root-Workspace-APIs
 */
function fixHref(resource, href) {
    try {
        if (!href) {
            return href;
        }

        // Use href if it is already an URL
        const hrefUri = vscode.Uri.parse(href);
        if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
            return hrefUri.toString();
        }

        // Use a home directory relative path If it starts with ^.
        if (href.indexOf('~') === 0) {
            return vscode.Uri.file(href.replace(/^~/, os.homedir())).toString();
        }

        // Use href as file URI if it is absolute
        if (path.isAbsolute(href) || hrefUri.scheme === 'file') {
            return vscode.Uri.file(href).toString();
        }

        // Use a workspace relative path if there is a workspace and markdown-pdf.stylesRelativePathFile is false
        var stylesRelativePathFile = vscode.workspace.getConfiguration('markdown-pdf')['stylesRelativePathFile'];
        let root = vscode.workspace.getWorkspaceFolder(resource);
        if (stylesRelativePathFile === false && root) {
            return vscode.Uri.file(path.join(root.uri.fsPath, href)).toString();
        }

        // Otherwise look relative to the markdown file
        return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
    } catch (error) {
        showErrorMessage('fixHref()', error);
    }
}

function checkPuppeteerBinary() {
    try {
        // settings.json
        var executablePath = ''
        if (isExistsPath(executablePath)) {
            INSTALL_CHECK = true;
            return true;
        }

        // bundled Chromium
        const puppeteer = require('puppeteer');
        executablePath = puppeteer.executablePath();
        if (isExistsPath(executablePath)) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        showErrorMessage('checkPuppeteerBinary()', error);
    }
}

function showErrorMessage(msg, error) {
    console.log('ERROR: ' + msg);
    if (error) {
        console.log(error);
    }
}


var args = process.argv.slice(2);
MarkdownPdf('pdf', args[0]);
