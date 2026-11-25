/*global view, VIS, utils, d3 */
"use strict";

view.doc = function (p) {
    var div = d3.select("div#doc_view"),
        total_tokens = p.total_tokens,
        topics = p.topics,
        trs, trs_enter;

    // TODO option to select docs by id, not index

    d3.select("#doc_view_main").classed("hidden", false);

    div.select("h2#doc_header")
        .html(p.citation);

    div.select("#doc_remark .token_count")
        .text(p.total_tokens);

    // no link at all if the bib type gives no URL for this document
    div.select("#doc_remark .doc_url")
        .classed("hidden", !p.url);
    div.select("#doc_remark a.url")
        .attr("href", p.url || null);

    trs = div.select("table#doc_topics tbody")
        .selectAll("tr")
        .data(topics.map(function (d, j) {
            return {
                t: d.topic,
                topic: p.ids[j],
                weight: d.weight,
                label: p.labels[j],
                words: p.words[j]
            };
        }));

    trs_enter = trs.enter().append("tr");
    trs.exit().remove();

    trs.on("click", function (t) {
        view.dfb().set_view({ type: "topic", param: t.topic });
    })
        .on("mouseover", function (t) { view.doc.text.focus(t.t); })
        .on("mouseout", function () { view.doc.text.focus(); });

    trs_enter.append("td").call(function (td) {
        td.append("span").classed("doc_swatch", true);
        td.append("a")
            .classed("topic_name", true)
            .append("span")
                .classed("name", true);
    });

    trs.select("a.topic_name")
        .attr("href", function (t) {
            return view.dfb().view_link({ type: "topic", param: t.topic });
        })
        .select("span.name")
            .text(function (t) { return t.label; });

    trs_enter.append("td").append("a")
        .classed("topic_words", true)
        .append("span")
            .classed("words", true);
    trs.select("a.topic_words")
        .attr("href", function (t) {
            return view.dfb().view_link({ type: "topic", param: t.topic });
        })
        .select("span.words")
            .text(function (t) {
                return t.words.reduce(function (acc, x) {
                    return acc + " " + x.word;
                }, "");
            });

    view.weight_tds({
        sel: trs,
        enter: trs_enter,
        w: function (t) { return t.weight / total_tokens; },
        frac: function (t) {
            return d3.format(VIS.percent_format)(t.weight / total_tokens);
        },
        raw: p.proper ? undefined : function (t) { return t.weight; }
    });

    // colors for highlighting the text: the page's largest topics (the
    // topics come sorted by weight)
    view.doc.colors = d3.map();
    topics.slice(0, view.doc.n_colors).forEach(function (d, j) {
        view.doc.colors.set(d.topic, view.doc.palette[j]);
    });
    trs.select("span.doc_swatch")
        .style("background-color", function (t) {
            return view.doc.colors.get(t.t) || null;
        });
    view.doc.text.paint();
};

// how many of a page's topics get their own highlight color
view.doc.n_colors = 10;
view.doc.palette = d3.scale.category10().range();
view.doc.colors = d3.map();


// The document's text, if the browser has texts (VIS.text).
// p.enabled: false to hide the section
// p.loading: true while the text is being fetched
// p.text: the text, or undefined if there is none
// p.note: optional remark shown above the text
// p.assignments: optional topic assignments of the text's words, as
//   written by bin/prepare-text-topics: [gap, n, topic, ...]
// p.label: function giving a topic's label, for tooltips
view.doc.text = function (p) {
    var div = d3.select("div#doc_text"),
        shown = view.doc.text.shown,
        body = div.select(".doc_text_body"),
        has_topics = !p.loading && p.text !== undefined && !!p.assignments;

    div.classed("hidden", !p.enabled);
    if (!p.enabled) {
        return;
    }

    div.select(".doc_text_note")
        .classed("hidden", !p.note)
        .text(p.note || "");

    div.select("a.doc_text_toggle")
        .text(shown ? "hide" : "show")
        .on("click", function () {
            d3.event.preventDefault();
            view.doc.text.shown = !shown;
            view.doc.text(p);
        });

    div.select("a.doc_text_topics")
        .classed("hidden", !shown || !has_topics)
        .text(view.doc.text.highlight ? "topics off" : "topics on")
        .on("click", function () {
            d3.event.preventDefault();
            view.doc.text.highlight = !view.doc.text.highlight;
            view.doc.text(p);
        });
    div.select(".doc_text_legend")
        .classed("hidden", !shown || !has_topics
            || !view.doc.text.highlight);

    body.classed("hidden", !shown)
        .classed("doc_text_missing", !p.loading && p.text === undefined)
        .classed("highlighting", has_topics && view.doc.text.highlight);
    // the topic table's color swatches only mean something while
    // the text is highlighted
    d3.select("#doc_view").classed("text_highlighting",
        shown && has_topics && view.doc.text.highlight);

    if (p.loading || p.text === undefined) {
        body.text(p.loading ? "Loading text..."
            : "No text is available for this document.");
    } else if (has_topics) {
        view.doc.text.spans(body.node(), p.text, p.assignments);
        body.selectAll("span.tw")
            .on("mouseover", function (t) {
                view.tooltip().text(p.label(t));
                view.tooltip().update_pos();
                view.tooltip().show();
            })
            .on("mousemove", function () { view.tooltip().update_pos(); })
            .on("mouseout", function () { view.tooltip().hide(); });
        view.doc.text.paint();
    } else {
        body.text(p.text);
    }
    body.node().scrollTop = 0;
};

// whether the text is shown, and highlighted by topic (kept as the reader
// moves between documents)
view.doc.text.shown = true;
view.doc.text.highlight = true;

// Fill node with text, wrapping each word the model assigned to a topic
// in a span.tw whose datum is the topic (0-based). Words are counted as in
// bin/prepare-text-topics.
view.doc.text.spans = function (node, text, a) {
    var re = /[A-Za-z]+/g,
        words = [ ], m, j, wi = 0, pos = 0, start, end, span;

    m = re.exec(text);
    while (m !== null) {
        words.push([m.index, m.index + m[0].length]);
        m = re.exec(text);
    }

    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
    for (j = 0; j + 2 < a.length; j += 3) {
        wi += a[j];
        if (wi + a[j + 1] > words.length) {
            break;
        }
        start = words[wi][0];
        end = words[wi + a[j + 1] - 1][1];
        if (start > pos) {
            node.appendChild(document.createTextNode(text.slice(pos, start)));
        }
        span = document.createElement("span");
        span.className = "tw";
        span.textContent = text.slice(start, end);
        d3.select(span).datum(a[j + 2]);
        node.appendChild(span);
        pos = end;
        wi += a[j + 1];
    }
    if (pos < text.length) {
        node.appendChild(document.createTextNode(text.slice(pos)));
    }
};

// color the highlighted words by the current page's topic colors; words of
// other topics are only underlined
view.doc.text.paint = function () {
    d3.selectAll("#doc_text span.tw")
        .classed("tw_other", function (t) {
            return !view.doc.colors.has(t);
        })
        .style("background-color", function (t) {
            var c = view.doc.colors.get(t);
            if (!c) {
                return null;
            }
            c = d3.rgb(c);
            return "rgba(" + c.r + "," + c.g + "," + c.b + ",0.3)";
        });
};

// highlight only topic t's words (undefined: all topics)
view.doc.text.focus = function (t) {
    d3.selectAll("#doc_text span.tw")
        .classed("tw_faded", function (x) {
            return t !== undefined && x !== t;
        });
};
