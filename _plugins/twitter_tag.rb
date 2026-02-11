module Jekyll
  class TwitterTag < Liquid::Tag
    def initialize(tag_name, markup, tokens)
      super
      @url = markup.strip
    end

    def render(context)
      "<blockquote><a href=\"#{@url}\">#{@url}</a></blockquote>"
    end
  end
end

Liquid::Template.register_tag('twitter', Jekyll::TwitterTag)
