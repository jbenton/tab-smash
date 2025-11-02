declare global {
  namespace chrome {
    namespace bookmarks {
      interface BookmarkTreeNode {
        id: string
        parentId?: string
        index?: number
        url?: string
        title: string
        dateAdded?: number
        dateGroupModified?: number
        unmodifiable?: string
        children?: BookmarkTreeNode[]
      }

      interface CreateDetails {
        parentId?: string
        index?: number
        title?: string
        url?: string
      }

      interface BookmarkUpdateFieldsType {
        title?: string
        url?: string
      }

      function create(details: CreateDetails): Promise<BookmarkTreeNode>
      function get(idOrIdList: string | string[]): Promise<BookmarkTreeNode[]>
      function getChildren(id: string): Promise<BookmarkTreeNode[]>
      function getSubTree(id: string): Promise<BookmarkTreeNode[]>
      function search(query: string | { query?: string; title?: string; url?: string }): Promise<BookmarkTreeNode[]>
      function update(id: string, changes: BookmarkUpdateFieldsType): Promise<BookmarkTreeNode>
      function move(id: string, destination: { parentId: string; index?: number }): Promise<BookmarkTreeNode>
      function remove(idOrIdList: string | string[]): Promise<void>
      function removeTree(idOrIdList: string | string[]): Promise<void>
    }
  }
}

export {}